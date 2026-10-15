// Q&A assistant for the admin batch import page.
// Answers questions about: Excel format, default password/role, how table data
// overrides defaults, common errors, etc. Uses Qwen via DashScope.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getAiConfig } from "../_shared/ai-router.ts";
import { stripDecorations } from "../_shared/format-answer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ChatMsg = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `你是「本科生创新实践学分认定系统」管理员端「批量导入账号」页面的中文助手。
请用简洁、友好的简体中文回答管理员的问题。除了批量导入本身，也可以回答本系统其他模块的常见操作问题。

【输出风格 — 强制】
- 只输出纯文本简体中文，禁止任何 markdown 强调符号（** __ * _ # >）。
- 禁止任何装饰性 emoji（⚠️ 📎 👇 ✅ ❌ 🎉 🤖 💡 等）和带圈数字（1️⃣ 2️⃣ ...）。
- 禁止出现数据库字段名或表名，例如 student_no、full_name、college_name、colleges、user_roles、profiles、applications；统一翻译成「学号/工号」「姓名」「学院」「学院名单」「角色记录」「用户档案」「申请记录」。
- 需要强调时直接用「」或换行；分步骤用 1) 2) 3) 这种纯数字写法。
- 语气克制，像同事之间正常说话即可。

【最重要的规则】
- 必须针对用户"当前这一句"的具体问题作答；不要每次都重复完整的导入流程。
- 只有在用户明确说「怎么导入 / 怎么用 / 我要导入」并且对话里之前没有讲过流程时，才完整介绍 4 步流程。
- 其他问题（密码、学院、表头、失败排查、改密码、改学院、登录失败、角色权限、审核流程等）只回答与该问题相关的内容，2-5 句话即可。
- 同一段流程介绍不要在对话中重复输出。如果上一条助手回复已经覆盖了用户当前问题的核心，请直接说「前面已经回答过：…」并只补充新增信息，禁止整段复制上一条回复。
- 用户的追问（含"那…呢" "改不了" "没生效" "为什么" "失败了" "忘了" 等）通常是新场景，请重新理解，不要把它当作前一个问题的同义重复。

【回答边界 — 分层】
1) 与"批量导入账号"直接相关 → 详细回答，可分步骤。
2) 本系统其他模块（账号管理、密码重置、角色调整、学院归属、提交窗口、申请审核、AI 模型/规则/关键词、学生与教师管理等）→ 用 1-3 句给出操作指引，并指明所在页面名称（如「用户管理」「审核中心」），不必给完整路径。
3) 与本系统完全无关（写代码、闲聊、天气等）→ 才礼貌拒答并引导回本系统主题。

【系统知识小抄 — 仅供你参考，不要逐字背给用户】
- 用户管理：管理员/超级管理员可在该页面新增、编辑、停用账号，重置初始密码，调整角色，调整所属学院。
- 学院管理（仅超级管理员）：维护学院名单；学院名称必须与导入表里完全一致。
- 管理员管理（仅超级管理员）：分配学院管理员。
- 提交窗口：控制学生何时可以提交申请。
- 审核中心 / 我的审核：人工复核 AI 初审结果，分「系统核验中」「待教师复核」「已通过」「已退回」。
- AI 模型 / 关键词 / 规则：配置 AI 审核所用的模型、关键词词库与判定规则。
- 学生忘记密码 → 让管理员到「用户管理」选中该账号 → 重置密码。系统不支持"统一自定义初始密码"，初始密码恒为「学号 + 手机号后 6 位」。

【导入规则 — 必须严格遵守并准确告知用户】
1. 文件格式：仅支持 Excel（.xlsx / .xls）和 CSV。第一行必须是表头，从第二行开始是数据。
2. 必填列：学号/工号、姓名。其他列（学院、专业、班级、年级、性别、民族、政治面貌、出生日期、辅导员、手机号、公寓号、宿舍号、床号、角色）可选。
3. 表头识别：列名可任意写法（学号 / 学生编号 / 工号 / Student No 等），AI 会自动匹配。
4. 默认角色：管理员可在输入框设置「默认角色」（管理员 / 教师 / 学生）。设置方式：发送「默认角色=学生」即可。
5. 优先级（重要）：表格内每一行如果填写了角色列，以表格中的数据为准；为空时才用默认角色。
6. 角色映射：表格中可写「管理员 / 教师 / 老师 / 学生」或英文 admin/teacher/student，会自动归一。
7. 密码规则（系统统一生成，无法自定义默认密码）：每个账号的初始密码 = 学号 + 该账号电话号码后 6 位。如果电话不足 6 位，会在左侧补 0 至 6 位。如表格自带「密码」列且 ≥ 6 位则以该列为准。
8. 重复处理：学号已存在的账号会让本批整体失败并提示冲突列表，不会覆盖已有账号。
9. 批量上限：单次最多约 2000 行，超过会自动分批提交（每批 200 行）。
10. 学院归属：超级管理员导入教师 / 管理员时，每行必须填写「学院」列（须与系统中的学院名称完全一致）；普通学院管理员导入时，新账号自动归属到该管理员所在学院，无需在表中填写。

【关键操作流程 — 必须告诉用户】
本助手不会通过聊天直接创建账号。导入必须按下面步骤手工操作：
1) 点击聊天输入框左侧的「上传文件」按钮，选择 .xlsx / .xls / .csv
2) 助手会自动读取并用 AI 识别字段，弹出预览表（带格式校验，异常行标红）
3) 核对预览后，点击预览下方的「确认导入」按钮才会真正写入数据库
4) 完成后会出现绿色的「导入成功」卡片，并提供「去学生管理查看」按钮

如果用户说"已经导入了/导入完成了/为什么没看到"，先提醒他：必须完成 1) 2) 3) 三步并出现 4) 的绿色成功卡片才算成功；只在聊天框打字是不会创建账号的。请引导他点左下角的「上传文件」按钮。

【回答风格】
- 直接回答问题；如果用户问"怎么用 / 怎么导入"，分步骤简短说明。
- 不要编造表格内没有的字段，也不要编造系统里不存在的页面或按钮。
- 不输出多余前缀；可用 1) 2) 3) 列点。
- 回答控制在 200 字以内，除非用户明确要求详细。
- 如果用户问题非常模糊（如"什么"、"你好"、"在吗"），先用一句话打招呼，然后列出 3-5 条本页常见提问让用户挑选。`;

// 字段/表名 -> 中文，用于在返回给前端前清洗，避免任何残留英文标识。
const FIELD_MAP: Array<[RegExp, string]> = [
  [/\bstudent_no\b/g, "学号/工号"],
  [/\bfull_name\b/g, "姓名"],
  [/\bcollege_name\b/g, "学院"],
  [/\bcollege_id\b/g, "学院"],
  [/\bclass_name\b/g, "班级"],
  [/\benrollment_year\b/g, "年级"],
  [/\bbirth_date\b/g, "出生日期"],
  [/\bpolitical_status\b/g, "政治面貌"],
  [/\bapartment_no\b/g, "公寓号"],
  [/\bdorm_room\b/g, "宿舍号"],
  [/\bbed_no\b/g, "床号"],
  [/\bdepartment\b/g, "院系"],
  [/\bmajor\b/g, "专业"],
  [/\bphone\b/g, "手机号"],
  [/\bcolleges\b/g, "学院名单"],
  [/\buser_roles\b/g, "角色记录"],
  [/\bprofiles\b/g, "用户档案"],
  [/\bapplications\b/g, "申请记录"],
];
function translateFields(s: string): string {
  let out = s;
  for (const [re, zh] of FIELD_MAP) out = out.replace(re, zh);
  return out;
}

// 常见问题的确定性回答 —— 命中后直接返回，绕过模型，避免反复输出同一段流程。
const QUICK_ANSWERS: Array<{ test: (q: string) => boolean; answer: string }> = [
  {
    test: (q) =>
      // 仅当用户问的就是"初始/默认密码是什么/规则"，不能含"改/重置/忘/登录"等动词。
      q.length <= 18 &&
      /(初始|默认)密码/.test(q) &&
      /(是什么|是啥|规则|多少|怎么生成|怎么算)/.test(q) &&
      !/(改|重置|忘|登录|登陆|不上|失败|没生效)/.test(q),
    answer:
      "初始密码由系统统一生成，规则是「学号 + 手机号后 6 位」。手机号不足 6 位时左侧补 0；没有手机号则后 6 位全部为 0。如果在表里填写了「密码」列且长度不少于 6 位，则以表里那一列为准。不支持自定义默认密码。\n\n如果你问的是其他场景（比如忘记密码、改密码），请直接发详细问题，我会重新回答。",
  },
  {
    test: (q) =>
      q.length <= 22 &&
      ((/学院.{0,6}(列|字段).{0,6}(必填|可选|怎么填|怎么写|要不要填)/.test(q)) ||
        (/学院.{0,4}是否.{0,4}必填/.test(q))) &&
      !/(改|换|转|错了|不对|找不到|没有)/.test(q),
    answer:
      "学院列要填写系统里已存在的学院名称，必须完全一致。超级管理员导入教师或管理员账号时，每一行都必须填写学院列；普通学院管理员导入时学院列可以留空，新账号会自动归属到管理员本人所在的学院。\n\n如果你问的是其他学院相关问题（比如调整某个账号的学院），请直接发详细问题，我会重新回答。",
  },
  {
    test: (q) =>
      q.length <= 22 &&
      ((/(怎么|如何|怎样|步骤|流程).{0,6}(导入|批量).{0,6}(教师|老师)/.test(q)) ||
        (/(导入|批量).{0,6}(教师|老师).{0,6}(怎么|如何|步骤|流程)/.test(q))),
    answer:
      "导入教师账号步骤：1) 在页面顶部点「下载教师模板」；2) 按列填写工号、姓名、学院、手机号等；3) 点输入框左侧的「上传文件」按钮选择填好的 Excel；4) 在弹出的预览表里核对，没问题再点下方的「确认导入」。学院列必须填写系统里已有的学院名称。",
  },
  {
    test: (q) =>
      q.length <= 22 &&
      /(导入).{0,4}(失败|报错|出错|没成功|没导入)/.test(q),
    answer:
      "导入失败常见原因：1) 学号或工号已经在系统里存在，可勾选「跳过已存在」后重试；2) 必填项（学号、姓名、角色）有空值；3) 出生日期格式不是 YYYY-MM-DD；4) 学院名称与系统里的不一致；5) 单元格里有多余的空格或全角符号。预览表里红色高亮的单元格就是出问题的字段，修正源表后重新上传即可。",
  },
  {
    test: (q) =>
      q.length <= 22 &&
      ((/(表头|列名|模板).{0,4}(有哪些|哪些|是什么|包含|包括)/.test(q)) ||
        (/有哪些(列|字段)/.test(q))),
    answer:
      "模板共 17 列，必填的是学号/工号、姓名、角色；其余可选项包括性别、民族、政治面貌、出生日期、手机号、学院、院系、专业、班级、年级、辅导员、公寓号、宿舍号、床号。直接点页面顶部「下载学生模板」或「下载教师模板」获取最新表头。",
  },
];

// 守卫：用户句子里出现下面这些"追问/排错/改动"语气词时，禁止走 QUICK_ANSWERS，
// 一律交给模型回答，避免"问了不同的问题却拿到同一段固定文本"。
const FOLLOWUP_GUARDS = /(怎么改|改不了|没生效|为什么|怎么办|失败了|帮我|忘了|忘记|不能|不行|登录不上|登不上|重置|找回|删除|停用|禁用|换学院|转学院)/;

function shouldUseQuickAnswer(q: string): number {
  if (q.length > 18 && FOLLOWUP_GUARDS.test(q)) return -1;
  for (let i = 0; i < QUICK_ANSWERS.length; i++) {
    if (QUICK_ANSWERS[i].test(q)) return i;
  }
  return -1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimErr } = await userClient.auth.getClaims(token);
    if (claimErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const callerId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // 用户可能同时拥有多条角色记录（admin + super_admin），用 limit(1) 而非
    // maybeSingle() 以避免 PostgREST 多行错误导致的误 Forbidden。
    const { data: roleRows } = await admin
      .from("user_roles").select("role")
      .eq("user_id", callerId).in("role", ["admin", "super_admin"]).limit(1);
    if (!Array.isArray(roleRows) || roleRows.length === 0) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const messages = (body.messages ?? []) as ChatMsg[];
    const defaults = body.defaults ?? { role: "student", password: "123456" };

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content?.trim();
    if (!lastUser) return json({ error: "messages 不能为空" }, 400);

    // 命中"高置信度短问"才走快捷回答，否则全部交给模型。
    const qaIdx = shouldUseQuickAnswer(lastUser);
    if (qaIdx >= 0) {
      console.log(`[import-assistant] quick-answer hit #${qaIdx} for: ${lastUser.slice(0, 60)}`);
      return json({ answer: QUICK_ANSWERS[qaIdx].answer });
    }

    // 保留更长的历史窗口（最多 12 条），并把过长的 assistant 内容截断，
    // 让模型看到"已经回答过什么"，避免重复输出同一段话。
    const trimmed = messages.slice(-12).map((m) => ({
      role: m.role,
      content:
        m.role === "assistant"
          ? String(m.content ?? "").slice(0, 600)
          : String(m.content ?? "").slice(0, 2000),
    }));
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.content ?? "";

    let aiCfg;
    try { aiCfg = await getAiConfig("import-assistant-chat"); }
    catch (e) { return json({ error: (e as Error).message }, 500); }
    const apiKey = aiCfg.apiKey;
    const aiUrl = `${aiCfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;

    const contextHint = `[当前默认值] 角色=${defaults.role}，密码=${defaults.password}`;
    const antiRepeatHint =
      "下面是用户的最新一句问题，请只针对这一句作答；如果与上一条助手回复主题不同，请重新理解，不要复制上一条；如果主题相同，请用一句话指出「前面已经回答过」再补充新增信息。";

    let aiResp: Response | null = null;
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        aiResp = await fetch(aiUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: aiCfg.model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "system", content: contextHint },
              { role: "system", content: antiRepeatHint },
              ...trimmed,
            ],
            temperature: 0.6,
          }),
        });
        if (aiResp.ok) break;
        if (aiResp.status === 429 || aiResp.status >= 500) {
          lastErr = `HTTP ${aiResp.status}`;
          await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
          continue;
        }
        break;
      } catch (e) {
        lastErr = (e as Error).message;
        await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
      }
    }
    if (!aiResp || !aiResp.ok) {
      return json({
        answer: `抱歉，AI 暂时无法回答（${lastErr || aiResp?.status}）。\n你可以直接点下方「上传文件」按钮上传 Excel/CSV，或发送「默认角色=学生」调整默认值。`,
      });
    }

    const data = await aiResp.json();
    let raw = data?.choices?.[0]?.message?.content?.trim() || "（无回答）";
    let answer = translateFields(stripDecorations(raw));

    // 如果与上一条助手回复高度重复（>=80% 字符相同），用 Lovable AI Gateway 重试一次，
    // 让回答更贴合"当前这一句问题"。
    if (lastAssistant && similarity(answer, lastAssistant) >= 0.8) {
      const lovableKey = Deno.env.get("LOVABLE_API_KEY");
      if (lovableKey) {
        try {
          const retry = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "system", content: contextHint },
                {
                  role: "system",
                  content:
                    "上一次回答与历史助手回复几乎相同，已被判定为复读。请重新理解用户最新这一句问题，给出与之前明显不同、且更贴合的回答。",
                },
                ...trimmed,
              ],
              temperature: 0.7,
            }),
          });
          if (retry.ok) {
            const rd = await retry.json();
            const rraw = rd?.choices?.[0]?.message?.content?.trim();
            if (rraw) answer = translateFields(stripDecorations(rraw));
          }
        } catch (_) { /* fall through */ }
      }
    }

    return json({ answer });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// 粗略字符级相似度（基于 bigram 集合 Jaccard），够用即可。
function similarity(a: string, b: string): number {
  const norm = (s: string) => s.replace(/\s+/g, "");
  const A = norm(a), B = norm(b);
  if (!A || !B) return 0;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const sa = grams(A), sb = grams(B);
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
