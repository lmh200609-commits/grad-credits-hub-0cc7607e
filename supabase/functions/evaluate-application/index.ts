// 系统材料核验：仅校验"材料 vs 关键词 vs 学生姓名"一致性，及是否存在
// 明显篡改 / AI 生成痕迹 / 无关图片。其他内容（学分大小等）不严格校验。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getAiConfig, callChatCompletions } from "../_shared/ai-router.ts";
import { CREDIT_REFERENCE, creditFinalizationPolicy } from "./credit-reference.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HIGH_CONFIDENCE = 0.85;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
const DEFAULT_SCHOOL = "长春财经学院";
const SCHOOL_ALIASES: string[] = ["长春财经学院", "长财", "ccufe", "changchun university of finance"];

/** 简易联网检索：用 r.jina.ai 抓取 DuckDuckGo HTML 摘要，无需新 secret。 */
async function webSearch(query: string): Promise<string> {
  try {
    const url = `https://r.jina.ai/https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0" } });
    clearTimeout(t);
    if (!r.ok) return `（联网检索失败，HTTP ${r.status}）`;
    const txt = await r.text();
    return txt.slice(0, 1500);
  } catch (e) {
    return `（联网检索异常：${(e as Error).message}）`;
  }
}

/** 把本次 AI 评估失败的原因写入 applications，便于前端显示并提供重试入口。 */
async function writeFailure(adminClient: any, appId: string | null, message: string) {
  if (!adminClient || !appId) return;
  try {
    await adminClient
      .from("applications")
      .update({
        ai_last_error: String(message).slice(0, 500),
        ai_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", appId);
  } catch (e) {
    console.error("[evaluate] writeFailure error:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 提到 try 外，以便 catch 中也能写 ai_last_error
  // 用 any 避免 SupabaseClient 类型推断把后续 .from(...) 收窄为 never
  let admin: any = null;
  let application_id: string | null = null;

  try {
    // ---- AuthN: verify caller JWT ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isServiceCall = authHeader === `Bearer ${serviceKey}`;
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    let callerId = "";
    if (!isServiceCall) {
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims) {
        return json({ error: "Unauthorized" }, 401);
      }
      callerId = claimsData.claims.sub as string;
    }

    const body = await req.json();
    application_id = body?.application_id ?? null;
    if (!application_id) return json({ error: "application_id required" }, 400);

    admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let { data: app, error: appErr } = await admin
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .single();
    if (appErr || !app) return json({ error: "Application not found" }, 404);

    // ---- AuthZ: caller must own the application OR be teacher/admin ----
    if (!isServiceCall && app.student_id !== callerId) {
      const [{ data: isTeacher }, { data: isAdmin }] = await Promise.all([
        admin.rpc("has_role", { _user_id: callerId, _role: "teacher" }),
        admin.rpc("has_role", { _user_id: callerId, _role: "admin" }),
      ]);
      if (!isTeacher && !isAdmin) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    // 新流程：AI 评估优先，AIGC 鉴别在评估通过后由 trigger 唤起。
    // 若已被 AIGC 一票否决（fake → rejected_by_ai），直接跳过本次评估。
    if (app.status === "rejected_by_ai" && app.aigc_status === "fake") {
      return json({
        status: app.status,
        skipped: true,
        reason: "aigc_fake",
      });
    }

    const { data: studentProfile } = await admin
      .from("profiles")
      .select("full_name, student_no, department, class_name, id_card, major")
      .eq("user_id", app.student_id)
      .single();

    const maskIdCard = (id: string | null | undefined) => {
      if (!id) return null;
      const s = String(id).trim();
      if (s.length < 10) return s;
      return `${s.slice(0, 6)}********${s.slice(-4)}`;
    };

    const selected: string[] = app.selected_keywords ?? [];
    const custom: string[] = app.custom_keywords ?? [];
    const allKw = [...selected, ...custom];

    // 学生端 AI 初审佐证：仅来自案例库（cases）
    // 服务端按关键词 ilike 匹配，避免数千案例时漏检 / 超量传输
    type CaseRow = { id: string; title: string; summary: string; awarded_credit: number | null };
    let relatedCases: CaseRow[] = [];
    const cleanedKw = allKw.filter((k) => k && k.trim().length > 0).slice(0, 8);
    if (cleanedKw.length) {
      const orExpr = cleanedKw
        .flatMap((k) => [`title.ilike.%${k}%`, `summary.ilike.%${k}%`])
        .join(",");
      let casesQ = admin
        .from("cases")
        .select("id, title, summary, awarded_credit")
        .or(orExpr)
        .order("created_at", { ascending: false })
        .limit(8);
      if (app.college_id) casesQ = casesQ.eq("college_id", app.college_id);
      const { data: matched } = await casesQ;
      relatedCases = (matched as CaseRow[]) ?? [];
    }

    // 计分：按命中关键词数量挑选最相关的"候选案例"
    const scoreCase = (c: CaseRow) => {
      const hay = `${c.title}\n${c.summary ?? ""}`.toLowerCase();
      return cleanedKw.reduce((n, k) => n + (hay.includes(k.toLowerCase()) ? 1 : 0), 0);
    };
    const candidateCase: CaseRow | null = relatedCases.length
      ? [...relatedCases].sort((a, b) => scoreCase(b) - scoreCase(a))[0]
      : null;

    // 新版填表流程：description 为序列化条目 JSON
    type ClaimedItem = { index: number; category: string; project: string; achievement: string; level: string; rank: string; credit: number | null };
    let claimedItems: ClaimedItem[] = [];
    try {
      const parsed = JSON.parse(app.description ?? "");
      if (parsed && Array.isArray(parsed.items)) claimedItems = parsed.items;
    } catch { /* 旧数据：纯文本说明 */ }

    // 下载附件图片（新版：application_attachments 多张，最多取 4 张；旧版回退单张 file_path）
    const imageDataUrls: string[] = [];
    let attachmentNote = "无附件";
    // 用临时签名链接交给模型读取，避免在函数里把大图转成 base64（会耗尽计算资源导致核对失败）。
    const toDataUrl = async (path: string): Promise<string | null> => {
      const { data, error: sErr } = await admin.storage
        .from("application-files")
        .createSignedUrl(path, 60 * 60);
      if (sErr || !data?.signedUrl) return null;
      const head = await fetch(data.signedUrl, { method: "HEAD" }).catch(() => null);
      if (!head || !head.ok) return null;
      return data.signedUrl;
    };

    // 每份佐证都要交给模型：先取每份的第 1 页，再补后续页，总数上限 12 张；每张图前标注对应证书名。
    const MAX_IMAGES = 12;
    const imageLabels: string[] = [];
    let attachPaths: { path: string; label: string }[] = [];
    if (claimedItems.length) {
      const { data: atts } = await admin
        .from("application_attachments")
        .select("file_path, file_name, cert_name")
        .eq("application_id", application_id)
        .order("sort_order", { ascending: true })
        .limit(30);
      const evid = (atts ?? []).filter((a) => /\.pdf$/i.test(a.file_path) || IMAGE_EXT.test(a.file_path));
      const labelOf = (a: { cert_name: string | null; file_name: string | null }, i: number) =>
        `佐证${i + 1}：${a.cert_name || a.file_name || "未命名"}`;
      const pages = [1, 2, 3, 4];
      for (const n of pages) {
        evid.forEach((a, i) => {
          if (/\.pdf$/i.test(a.file_path)) attachPaths.push({ path: `${a.file_path}.p${n}.jpg`, label: `${labelOf(a, i)}（第${n}页）` });
          else if (n === 1) attachPaths.push({ path: a.file_path, label: labelOf(a, i) });
        });
      }
    }
    if (attachPaths.length === 0 && app.file_path && IMAGE_EXT.test(app.file_path)) {
      attachPaths = [{ path: app.file_path, label: "佐证1" }];
    }
    for (const p of attachPaths) {
      if (imageDataUrls.length >= MAX_IMAGES) break;
      const d = await toDataUrl(p.path);
      if (d) { imageDataUrls.push(d); imageLabels.push(p.label); }
    }
    const imageDataUrl = imageDataUrls[0] ?? null; // 供既有兜底逻辑判断
    if (imageDataUrls.length) {
      attachmentNote = `已附佐证图片 ${imageDataUrls.length} 张`;
    } else if (attachPaths.length > 0) {
      attachmentNote = "PDF 未生成核对图片，需人工查看原件";
    } else if (app.file_path && !IMAGE_EXT.test(app.file_path)) {
      attachmentNote = `非图片附件 (${app.file_path.split(".").pop()})，未做视觉核验`;
    } else if (app.file_path) {
      attachmentNote = "附件下载失败";
    }

    const systemPrompt = `你是大学学分材料核验助手。

【认定范围参考】本科生创新实践学分的认定范围包括：科研成果（论文）、知识产权、科研训练（科研项目 / 大创项目）、学科竞赛、职业技能证书、创业实践、文体竞赛、第二课堂等。

【参考依据】历史人工通过案例库用于佐证材料参考；学分分值以以下正式认定标准为准。

${CREDIT_REFERENCE}

【语言要求 — 必须严格遵守】
- 所有字段值（含 reasoning、reasoning_short、detected_*）必须使用简体中文。
- 禁止输出 "null"、"N/A"、"none" 等英文占位符；无法识别时一律写「未识别」。
- 如必须引用英文缩写（如 SCI、ACM、CET），请用括号附中文解释，例如「ACM（国际大学生程序设计竞赛）」。

你需要做两类工作：

A. 四项核验（输出 4 个布尔字段 + name_match_ok 可为 null）：
1. 材料与关键词一致性：图片/文件展示的内容（证书名称、奖项、级别、身份）是否与学生选择的关键词完全一致。**关键：级别、身份、奖项等级有任何差异都算不一致**。例如学生选"国家级一等奖"但图片是"省级三等奖"，即使都是竞赛类，consistency_ok 也必须 = false。
2. 是否无关图片：图片是否完全与申请主题无关。
3. 篡改 / AI 生成痕迹：是否有明显 PS、拼接、AI 生成痕迹。
4. 姓名匹配：图片中姓名是否与学生姓名一致；图片中无姓名信息则填 null。

B. 从图片中实际识别的属性（detected_*，全部用中文，无法识别填「未识别」）：
- detected_project：项目大类（科研成果/知识产权/科研训练/学科竞赛/职业技能证书/创业实践/文体竞赛/第二课堂等）
- detected_achievement：成果细类（如"论文"、"专利"、"大创项目"、"英语等级证书"等）
- detected_level：级别（如"国家级一等奖"、"省级二等奖"、"校级"、"六级"等）
- detected_identity：身份（如"第一作者"、"主持人"、"第一参与人"等）

【判定规则 — 必须严格遵守，否则视为输出错误】
- 全部四项核验通过且 detected_* 与关键词的级别/身份/成果一致 → recommendation="approve"，confidence ∈ [0.85, 0.98]。
- 任一核验项为 false（含 consistency_ok / relevance_ok / authenticity_ok / name_match_ok=false）或明显造假 → 必须 recommendation="reject"，confidence ∈ [0.85, 0.98]。**禁止在任一核验失败的情况下输出 review。**
- 仅在"图片模糊到无法判断 / 信息缺失 / 同名同姓无法甄别 / 无可视觉核验的附件"时才能输出 recommendation="review"，且 confidence 必须 ∈ [0.40, 0.70]。**review 严禁出现 confidence ≥ 0.80 的情况，否则属于自相矛盾。**
- 无附件 → 默认 review，confidence ∈ [0.40, 0.55]。

reasoning 字段为详细中文说明，结构固定为：「材料一致性：…；图片相关性：…；真实性：…；姓名匹配：…；图片实际识别：项目=…，成果=…，级别=…，身份=…；结论：…」。每段不少于 8 字，禁止只写"是/否"。

reasoning_short：一句话（≤60 字）给学生看，只点出"是否通过 / 关键不通过原因"，不要暴露内部核验维度名称。例：「证书级别与所选关键词不一致」「材料清晰，已通过」「图片与申请主题无关」。`;

    const extraPrompt = `

【新增 C. 身份核验 — 必须严格执行】（输出 identity_match_ok + identity_mismatch_detail + detected_student_no + detected_school）
- 学生账号档案 student_profile 中的 full_name / student_no / department / class_name / id_card_masked / default_school 是"真值"。
- 如材料图片中未出现任何身份字段（学号 / 姓名 / 院系 / 班级 / 身份证 / 学校）→ identity_match_ok = true，detail = "材料未包含身份信息"。
- 如出现任意一项 → 必须与 student_profile 严格比对：姓名不符、学号不符、院系不符、班级不符、身份证前 6 位或末 4 位不符 → identity_match_ok = false。detail 用中文写明："材料姓名'XXX'与账号'YYY'不符" 之类。
- 学校特别规则：本系统默认学校为「${DEFAULT_SCHOOL}」。材料未写学校 → 视为一致；材料明确写了学校且不属于「${DEFAULT_SCHOOL}」/「长财」/「CCUFE」等同义表达 → identity_match_ok = false。
- detected_student_no = 图片中识别到的学号（无则填「未识别」）。
- detected_school = 图片中识别到的学校全称（无则填「未识别」）。

【新增 D. 逻辑性核验 — 必须严格执行】（输出 logic_ok + logic_issue_detail）
- 【今天的真实日期是 ${new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)}（北京时间），判断日期先后必须以此为准，禁止使用你自己的训练截止年份。】
- 检测常识性 / 数值 / 时间逻辑错误，例如：CET-4/CET-6 满分均为 710，材料若 > 710 即为伪造；GPA 通常上限 4.0/4.3/5.0；名次为负数/0/大于参赛人数；颁发日期早于学生入学年份或晚于今天；证书编号格式与官方明显不符。
- 必要时可调用 web_search 工具核实赛事 / 证书 / 期刊 / 颁发单位真伪，但必须以材料证据为主，禁止仅凭通识否定真实材料。
- 命中 → logic_ok = false，detail 用中文写明（如「材料显示 CET-4 = 720 分，CET-4 满分仅 710 分，分数不合理」）。
- 未命中 → logic_ok = true，detail = "未发现逻辑错误"。

【新增 E. 完整性核验 — 必须严格执行】（输出 completeness_ok + blank_fields_detail）
- 检测材料中关键字段（学校 / 院系 / 班级 / 姓名 / 学号 / 项目名 / 颁发单位）后是否出现"空白占位"：括号内为空（）()、下划线 ____、横线 ——、星号 ***、或冒号后直接换行。
- 命中任一关键字段为空 → completeness_ok = false，detail 用中文列出空白字段，如「学校、院系」。
- 未命中 → completeness_ok = true，detail = "关键字段均已填写"。

【任一新增核验项失败 → 必须 recommendation = "reject"，confidence ∈ [0.85, 0.98]，禁止 review 或 approve。】

【工具使用】可主动调用 web_search 工具（最多 2 次）辅助 D 项判断；完成全部核验后必须调用 submit_evaluation 提交结果。`;

    const fullSystemPrompt = systemPrompt + extraPrompt + (claimedItems.length ? `

【填表申请专项核验 — 本申请为学生填表提交，必须严格执行】
- application.claimed_items 是学生在《创新实践学分认定申请表》中逐条填报的条目（含大类/认定项目/成果名称/级别/本人排名/自报学分），后面的每张图片均为佐证材料。
- 逐条比对：佐证图片上的成果名称、级别、姓名、排名是否与填报条目相符；任何一条找不到对应佐证或关键信息不符 → consistency_ok = false，并在 reasoning 中写明是第几条、差在哪。
- 姓名/学号等身份信息以佐证图片为准与 student_profile 比对（identity 规则同上）。
- 学分合规：以图片真实级别与排名对照上述《长春财经学院创新实践学分认定标准》，逐条独立判断，学生传入的credit_standard_total仅参考。超标或偏低在credit_compliance_note写明，如「第2条自报10分，国家级B类一等奖团队负责人标准为8分」。无法判断填「待人工核定」。仅学分差异不得将consistency_ok或logic_ok判为false；材料真实且只有学分差异/条件待核定时recommendation=review，由教师最终定分。
- reasoning 结构改为：「逐条核验：第 1 条…；第 2 条…；身份核验：…；学分合规：…；结论：…」。
- 系统不替你给学分建议；你的职责是核验真伪与信息相符性。` : "");

    const userPayload = {
      student: {
        name: studentProfile?.full_name ?? "未知",
        student_no: studentProfile?.student_no ?? "未知",
        department: studentProfile?.department ?? "未知",
        major: studentProfile?.major ?? "未知",
        class_name: studentProfile?.class_name ?? "未知",
        id_card_masked: maskIdCard(studentProfile?.id_card) ?? "未提供",
        default_school: DEFAULT_SCHOOL,
      },
      application: claimedItems.length
        ? {
            claimed_items: claimedItems,
            claimed_credit_total: app.claimed_credit ?? null,
            credit_standard_total: app.credit_standard ?? null,
            credit_compliance: app.credit_compliance ?? null,
            attachment: attachmentNote,
          }
        : {
            description: app.description,
            selected_keywords: selected,
            custom_keywords: custom,
            attachment: attachmentNote,
          },
      candidate_case: candidateCase
        ? { title: candidateCase.title, awarded_credit: candidateCase.awarded_credit }
        : null,
      reference_cases: relatedCases.map((c) => ({
        title: c.title,
        summary: c.summary,
        awarded_credit: c.awarded_credit,
      })),
    };

    const userContent: unknown[] = [{ type: "text", text: JSON.stringify(userPayload) }];
    imageDataUrls.forEach((u, i) => {
      userContent.push({ type: "text", text: `下一张图片是【${imageLabels[i] ?? `佐证${i + 1}`}】` });
      userContent.push({ type: "image_url", image_url: { url: u } });
    });

    const tools = [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "联网检索辅助核实赛事 / 证书 / 期刊 / 颁发单位真伪。最多调用 2 次。",
          parameters: {
            type: "object",
            properties: { query: { type: "string", description: "中文检索关键词" } },
            required: ["query"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "submit_evaluation",
          description: "提交材料核验结果",
          parameters: {
            type: "object",
            properties: {
              consistency_ok: { type: "boolean" },
              relevance_ok: { type: "boolean" },
              authenticity_ok: { type: "boolean" },
              name_match_ok: { type: ["boolean", "null"] },
              identity_match_ok: { type: ["boolean", "null"], description: "学号/姓名/院系/班级/身份证/学校 与账号是否一致" },
              identity_mismatch_detail: { type: ["string", "null"] },
              logic_ok: { type: ["boolean", "null"] },
              logic_issue_detail: { type: ["string", "null"] },
              completeness_ok: { type: ["boolean", "null"] },
              blank_fields_detail: { type: ["string", "null"] },
              detected_project: { type: ["string", "null"] },
              detected_achievement: { type: ["string", "null"] },
              detected_level: { type: ["string", "null"] },
              detected_identity: { type: ["string", "null"] },
              detected_student_no: { type: ["string", "null"] },
              detected_school: { type: ["string", "null"] },
              credit_compliance_note: { type: ["string", "null"], description: "填表申请：自报学分与认定标准比对说明；无法判断填「待人工核定」" },
              confidence: { type: "number" },
              recommendation: { type: "string", enum: ["approve", "review", "reject"] },
              reasoning: { type: "string" },
              reasoning_short: { type: "string", description: "一句话给学生看，≤60 字" },
            },
            required: [
              "consistency_ok", "relevance_ok", "authenticity_ok", "name_match_ok",
              "identity_match_ok", "identity_mismatch_detail",
              "logic_ok", "logic_issue_detail",
              "completeness_ok", "blank_fields_detail",
              "detected_project", "detected_achievement", "detected_level", "detected_identity",
              "detected_student_no", "detected_school",
              "confidence", "recommendation", "reasoning", "reasoning_short",
            ],
            additionalProperties: false,
          },
        },
      },
    ];

    const messages: any[] = [
      { role: "system", content: fullSystemPrompt },
      { role: "user", content: userContent },
    ];

    let result: any = null;
    let websearchCount = 0;
    const MAX_WEBSEARCH = 2;
    const MAX_ROUNDS = 4;

    let aiCfg;
    try {
      aiCfg = await getAiConfig("evaluate-application");
    } catch (e) {
      const msg = (e as Error).message;
      await writeFailure(admin, application_id, msg);
      return json({ error: msg, retryable: true }, 500);
    }

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const forceSubmit = websearchCount >= MAX_WEBSEARCH || round === MAX_ROUNDS - 1;
      const aiResp = await callChatCompletions(aiCfg, {
        messages,
        tools,
        tool_choice: forceSubmit
          ? { type: "function", function: { name: "submit_evaluation" } }
          : "auto",
      });
      if (!aiResp.ok) {
        const t = await aiResp.text();
        console.error("Qwen gateway error:", aiResp.status, t);
        const msg = aiResp.status === 429
          ? "系统繁忙，AI 模型限流，请稍后重试"
          : `AI 模型调用失败：${t.slice(0, 200)}`;
        await writeFailure(admin, application_id, msg);
        return json({ error: msg, retryable: true }, aiResp.status === 429 ? 429 : 500);
      }
      const aiJson = await aiResp.json();
      const msg = aiJson.choices?.[0]?.message;
      const calls = msg?.tool_calls ?? [];
      if (!calls.length) {
        console.error("Qwen unexpected payload:", JSON.stringify(aiJson).slice(0, 500));
        await writeFailure(admin, application_id, "AI 模型返回了空 tool_calls");
        return json({ error: "系统返回格式错误", retryable: true }, 500);
      }
      messages.push(msg);

      let submitted = false;
      for (const call of calls) {
        const fname = call.function?.name;
        if (fname === "submit_evaluation") {
          try { result = JSON.parse(call.function.arguments); }
          catch { return json({ error: "系统返回格式错误（无法解析评估结果）" }, 500); }
          submitted = true;
          break;
        }
        if (fname === "web_search") {
          let q = "";
          try { q = JSON.parse(call.function.arguments)?.query ?? ""; } catch { /* ignore */ }
          let toolResult = "";
          if (websearchCount >= MAX_WEBSEARCH) {
            toolResult = "（已达联网检索次数上限，请基于已有材料给出判定）";
          } else if (!q.trim()) {
            toolResult = "（检索关键词为空）";
          } else {
            websearchCount++;
            console.log("[evaluate] web_search:", q);
            toolResult = await webSearch(q);
          }
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: toolResult.slice(0, 1500),
          });
        }
      }
      if (submitted) break;
    }

    if (!result) {
      await writeFailure(admin, application_id, "AI 模型未在限定轮次内返回评估结果");
      return json({ error: "系统未能完成核验，请重试", retryable: true }, 500);
    }

    // ---- 服务端硬规则：纠正 AI 自相矛盾 / 兜底中文化 ----
    const overrideNotes: string[] = [];
    const sanitize = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      const s = String(v).trim();
      if (!s) return null;
      // 把英文占位符统一改写为「未识别」
      if (/^(null|none|n\/a|undefined|unknown|无)$/i.test(s)) return "未识别";
      return s;
    };
    result.detected_project = sanitize(result.detected_project);
    result.detected_achievement = sanitize(result.detected_achievement);
    result.detected_level = sanitize(result.detected_level);
    result.detected_identity = sanitize(result.detected_identity);
    if (typeof result.reasoning === "string") {
      result.reasoning = result.reasoning
        .replace(/=\s*null/gi, "=未识别")
        .replace(/=\s*none/gi, "=未识别")
        .replace(/\bnull\b/g, "未识别");
    }
    if (typeof result.reasoning_short === "string") {
      result.reasoning_short = result.reasoning_short
        .replace(/\bnull\b/g, "未识别");
    }

    const failedChecks: string[] = [];
    if (result.consistency_ok === false) failedChecks.push("材料一致性");
    if (result.relevance_ok === false) failedChecks.push("图片相关性");
    if (result.authenticity_ok === false) failedChecks.push("真实性");
    if (result.name_match_ok === false) failedChecks.push("姓名匹配");
    if (result.identity_match_ok === false) failedChecks.push("身份核验");
    if (result.logic_ok === false)          failedChecks.push("逻辑性核验");
    if (result.completeness_ok === false)   failedChecks.push("材料完整性");

    // 注：AIGC 鉴别在本次 AI 评估完成后由数据库 trigger 异步触发；
    // 本函数不再读取 / 描述 aigc_status。

    // 学校兜底：detected_school 非空且不属于默认学校族 → 强制身份不符
    const detSchool = (result.detected_school ?? "").toString().trim().toLowerCase();
    if (detSchool && detSchool !== "未识别") {
      const ok = SCHOOL_ALIASES.some((a) => detSchool.includes(a.toLowerCase()));
      if (!ok) {
        if (result.identity_match_ok !== false) {
          result.identity_match_ok = false;
          const note = `材料学校『${result.detected_school}』不属于长春财经学院`;
          result.identity_mismatch_detail = result.identity_mismatch_detail
            ? `${result.identity_mismatch_detail}；${note}`
            : note;
          if (!failedChecks.includes("身份核验")) failedChecks.push("身份核验");
          overrideNotes.push(`服务端校验：${note}，已强制改判为「驳回」。`);
        }
      }
    }

    if (failedChecks.length > 0) {
      // 任一核验失败 → 强制驳回 + 高置信
      if (result.recommendation !== "reject") {
        const recMap: Record<string, string> = {
          approve: "通过",
          reject: "驳回",
          review: "需人工复核",
        };
        const orig = recMap[result.recommendation as string] ?? String(result.recommendation ?? "");
        overrideNotes.push(
          `AI 原判定为「${orig}」，但核验项「${failedChecks.join("、")}」未通过，已强制改判为「驳回」。`,
        );
        result.recommendation = "reject";
      }
      const c = Number(result.confidence ?? 0);
      if (!(c >= 0.85)) {
        overrideNotes.push(`（判定确信度按系统改判后的"明确驳回"重置为 90%。）`);
        result.confidence = 0.9;
      }
    } else if (result.recommendation === "review") {
      // review 不允许高置信度（自相矛盾）
      const c = Number(result.confidence ?? 0.5);
      if (c > 0.7) {
        overrideNotes.push(`AI 给出"需人工复核"但确信度 ${(c * 100).toFixed(0)}% 偏高（不确定本不应高确信），系统已校正为 70%。`);
        result.confidence = 0.7;
      }
      if (c < 0.4) {
        result.confidence = 0.4;
      }
    } else if (result.recommendation === "approve") {
      // approve 但无可视觉核验的附件 → 降级 review
      if (!imageDataUrl) {
        overrideNotes.push(`无可视觉核验的图片附件，已由「通过」降级为「需人工复核」。`);
        result.recommendation = "review";
        result.confidence = Math.min(Number(result.confidence ?? 0.6), 0.65);
      } else {
        const c = Number(result.confidence ?? 0);
        if (c < 0.85) result.confidence = 0.85;
      }
    }

    // 用 AI 从图片中识别到的真实属性重新匹配案例（防止学生选高分关键词配低级别证书）
    const detected = {
      project: result.detected_project as string | null,
      achievement: result.detected_achievement as string | null,
      level: result.detected_level as string | null,
      identity: result.detected_identity as string | null,
    };
    const hasDetection = !!(detected.project || detected.achievement || detected.level);
    // 在 relatedCases 中按 detected 关键词再次评分，得到 detectedCase
    const detectedTokens = [detected.project, detected.achievement, detected.level, detected.identity]
      .filter((x): x is string => !!x && x.length > 0);
    const detectedCase: CaseRow | null = (hasDetection && relatedCases.length)
      ? [...relatedCases].sort((a, b) => {
          const ha = `${a.title}\n${a.summary ?? ""}`.toLowerCase();
          const hb = `${b.title}\n${b.summary ?? ""}`.toLowerCase();
          const sa = detectedTokens.reduce((n, t) => n + (ha.includes(t.toLowerCase()) ? 1 : 0), 0);
          const sb = detectedTokens.reduce((n, t) => n + (hb.includes(t.toLowerCase()) ? 1 : 0), 0);
          return sb - sa;
        })[0]
      : null;

    // 优先使用 detected 匹配的案例；若与学生关键词派生的 candidateCase 不一致，强制走人工复核
    const effectiveCase = detectedCase ?? candidateCase;
    const detectedMismatch = hasDetection && candidateCase && detectedCase && detectedCase.id !== candidateCase.id;
    const creditPolicy = creditFinalizationPolicy(claimedItems.length, effectiveCase?.awarded_credit ?? null);
    if (creditPolicy.requiresTeacher && result.recommendation === "approve") {
      result.recommendation = "review";
      result.confidence = Math.min(Number(result.confidence ?? 0.65), 0.7);
      overrideNotes.push("填表申请的学分及认定条件须由教师确认，不自动落实学生自报学分。");
    }

    // 把 override notes 拼接到 reasoning 末尾，便于教师查看为什么被改判
    if (overrideNotes.length) {
      const tag = `\n\n【系统强制改判】${overrideNotes.join(" ")}`;
      result.reasoning = (result.reasoning ?? "") + tag;
    }

    // 填表申请：把学分合规比对说明附加到 reasoning
    const complianceNote = (result.credit_compliance_note ?? "").toString().trim();
    if (claimedItems.length && complianceNote && complianceNote !== "待人工核定") {
      result.reasoning = (result.reasoning ?? "") + `\n\n【学分合规比对】${complianceNote}`;
    }

    let nextStatus: string;
    let intendedAutoApprove = false;
    if (detectedMismatch) {
      // 学生选的关键词与图片识别结果对应不同案例 → 不能自动通过
      nextStatus = result.recommendation === "reject" ? "rejected_by_ai" : "pending_review";
    } else if (result.recommendation === "approve" && result.confidence >= HIGH_CONFIDENCE) {
      // 新流程：本应自动通过的图片申请，先暂存为 pending_review，等 AIGC 鉴别后再揭晓。
      // 无图片附件的申请不需要 AIGC，可以直接自动通过。
      const needsAigc = !!app.file_path && IMAGE_EXT.test(app.file_path);
      if (needsAigc) {
        nextStatus = "pending_review";
        intendedAutoApprove = true;
      } else {
        nextStatus = "auto_approved";
      }
    } else if (result.recommendation === "reject" && result.confidence >= HIGH_CONFIDENCE) {
      nextStatus = "rejected_by_ai";
    } else {
      nextStatus = "pending_review";
    }

    // 不再指向 rules 表；ai_matched_rule_id 写 null
    const matchedRuleId: string | null = null;
    // 填表申请以学生自报学分（合规时）为准；旧流程沿用案例学分
    const suggestedCredit = creditPolicy.suggestedCredit;

    await admin.from("application_reviews").insert({
      application_id,
      reviewer_id: null,
      action: "ai_evaluation",
      decision: nextStatus,
      credit: suggestedCredit,
      confidence: result.confidence,
      matched_rule_id: matchedRuleId,
      note: result.reasoning,
    });

    // 系统通过时直接落实学分，无需教师确认；教师仍可在详情页修改
    const isAutoApproved = nextStatus === "auto_approved";

    // 备份本次更新前的 AI 评估结果到 ai_previous_snapshot，便于一键回滚
    const prevSnapshot = {
      taken_at: new Date().toISOString(),
      status: app.status,
      ai_confidence: app.ai_confidence,
      ai_reasoning: app.ai_reasoning,
      ai_reasoning_short: app.ai_reasoning_short,
      ai_suggested_credit: app.ai_suggested_credit,
      ai_check_consistency: app.ai_check_consistency,
      ai_check_relevance: app.ai_check_relevance,
      ai_check_authenticity: app.ai_check_authenticity,
      ai_check_name_match: app.ai_check_name_match,
      ai_check_identity_match: app.ai_check_identity_match,
      ai_check_logic: app.ai_check_logic,
      ai_check_completeness: app.ai_check_completeness,
      ai_identity_mismatch: app.ai_identity_mismatch,
      ai_logic_issue: app.ai_logic_issue,
      ai_blank_fields: app.ai_blank_fields,
      ai_detected_project: app.ai_detected_project,
      ai_detected_achievement: app.ai_detected_achievement,
      ai_detected_level: app.ai_detected_level,
      ai_detected_identity: app.ai_detected_identity,
      ai_detected_student_no: app.ai_detected_student_no,
      ai_detected_school: app.ai_detected_school,
      ai_override_note: app.ai_override_note,
      review_source: app.review_source,
    };
    // 仅在已经存在过一轮 AI 结果时才保留快照（首轮无需备份）
    const hasPreviousResult =
      app.ai_confidence != null ||
      app.ai_reasoning != null ||
      app.ai_check_consistency != null ||
      app.status === "rejected_by_ai" ||
      app.status === "auto_approved";

    await admin
      .from("applications")
      .update({
        status: nextStatus,
        ai_matched_rule_id: matchedRuleId,
        ai_suggested_credit: suggestedCredit,
        ai_confidence: result.confidence,
        ai_reasoning: result.reasoning,
        ai_reasoning_short: typeof result.reasoning_short === "string"
          ? result.reasoning_short.slice(0, 80)
          : null,
        ai_check_consistency:  typeof result.consistency_ok  === "boolean" ? result.consistency_ok  : null,
        ai_check_relevance:    typeof result.relevance_ok    === "boolean" ? result.relevance_ok    : null,
        ai_check_authenticity: typeof result.authenticity_ok === "boolean" ? result.authenticity_ok : null,
        ai_check_name_match:   typeof result.name_match_ok   === "boolean" ? result.name_match_ok   : null,
        ai_check_identity_match: typeof result.identity_match_ok === "boolean" ? result.identity_match_ok : null,
        ai_check_logic:          typeof result.logic_ok          === "boolean" ? result.logic_ok          : null,
        ai_check_completeness:   typeof result.completeness_ok   === "boolean" ? result.completeness_ok   : null,
        ai_identity_mismatch:    result.identity_mismatch_detail ?? null,
        ai_logic_issue:          result.logic_issue_detail       ?? null,
        ai_blank_fields:         result.blank_fields_detail      ?? null,
        ai_detected_student_no:  result.detected_student_no      ?? null,
        ai_detected_school:      result.detected_school          ?? null,
        ai_detected_project:     result.detected_project     ?? null,
        ai_detected_achievement: result.detected_achievement ?? null,
        ai_detected_level:       result.detected_level       ?? null,
        ai_detected_identity:    result.detected_identity    ?? null,
        ai_override_note: overrideNotes.length ? overrideNotes.join(" ") : null,
        review_source: nextStatus === "pending_review"
          ? (intendedAutoApprove ? "awaiting_aigc" : "ai_uncertain")
          : null,
        final_credit: isAutoApproved ? suggestedCredit : null,
        reviewed_at: isAutoApproved ? new Date().toISOString() : null,
        ai_last_error: null,
        ai_last_attempt_at: new Date().toISOString(),
        ai_previous_snapshot: hasPreviousResult ? prevSnapshot : null,
        ai_intended_auto_approve: intendedAutoApprove,
      })
      .eq("id", application_id);

    // AI 评估通过后，立刻同步唤起 AIGC 检测；不阻塞响应。
    // DB 触发器 + 队列仍作为兜底，aigc-detect 内部已做幂等。
    const shouldTriggerAigc =
      nextStatus !== "rejected_by_ai" &&
      !!app.file_path &&
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(app.file_path) &&
      app.aigc_status === "pending";
    if (shouldTriggerAigc) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const aigcPromise = fetch(`${supabaseUrl}/functions/v1/aigc-detect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ application_id }),
      }).catch((e) => console.error("[evaluate-application] inline aigc-detect failed:", e));
      // @ts-ignore EdgeRuntime is available in Supabase edge runtime
      if (typeof EdgeRuntime !== "undefined" && (EdgeRuntime as any)?.waitUntil) {
        // @ts-ignore
        (EdgeRuntime as any).waitUntil(aigcPromise);
      }
    }

    return json({
      success: true,
      status: nextStatus,
      vision_used: !!imageDataUrl,
      aigc: {
        provider: app.aigc_provider ?? "aliyun",
        status: app.aigc_status,
        score: typeof app.aigc_score === "number" ? app.aigc_score : Number(app.aigc_score ?? 0),
      },
      ...result,
      matched_rule_id: matchedRuleId,
    });
  } catch (e) {
    console.error("evaluate error:", e);
    const msg = (e as Error).message;
    await writeFailure(admin, application_id, msg);
    return json({ error: msg, retryable: true }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
