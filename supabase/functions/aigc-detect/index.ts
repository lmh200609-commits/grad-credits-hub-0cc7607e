// AIGC 鉴别（阿里云内容安全 · ImageModeration aigcDetector_ultra 旗舰版）
// 仅检测学生上传图片是否为 AI 生成（Midjourney / SD / 豆包 Seedream / 通义万相 / Flux 等）。
// 写入 applications.aigc_* 字段，并按学院阈值更新 status：
//   real    → 保持 pending_ai，正常进学分评估
//   suspect → 保持 pending_ai，但 evaluate-application 看到后会强制降级 pending_review
//   fake    → 直接 rejected_by_ai，跳过学分评估
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { canReviewDetection, shouldSkipDetection } from "./retryPolicy.ts";

const BodySchema = z.object({ application_id: z.string().uuid(), force: z.boolean().default(false) });
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
const DEFAULT_SUSPECT = 0.40;
const DEFAULT_FAKE = 0.80;
type JwtHeader = { alg?: string; kid?: string };
type JwtClaims = { sub?: string; exp?: number; iss?: string; aud?: string; [key: string]: unknown };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function base64UrlJson<T>(input: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(input))) as T;
}

function cryptoAlg(alg?: string): EcKeyImportParams | RsaHashedImportParams {
  if (alg === "ES256") return { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  if (alg === "RS256") return { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  throw new Error("Unsupported JWT alg");
}

async function loadJwks(supaUrl: string): Promise<{ keys: JsonWebKey[] }> {
  const configured = Deno.env.get("SUPABASE_JWKS");
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed?.keys)) return parsed;
    } catch (_) {
      console.warn("[aigc-detect] SUPABASE_JWKS is not valid JSON, fetching JWKS instead");
    }
  }
  const resp = await fetch(`${supaUrl}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`JWKS fetch failed: ${resp.status}`);
  return await resp.json();
}

async function verifyJwtLocally(token: string, supaUrl: string): Promise<JwtClaims> {
  const [rawHeader, rawPayload, rawSignature] = token.split(".");
  if (!rawHeader || !rawPayload || !rawSignature) throw new Error("Invalid JWT structure");
  const header = base64UrlJson<JwtHeader>(rawHeader);
  const payload = base64UrlJson<JwtClaims>(rawPayload);
  if (!payload.sub) throw new Error("Missing sub claim");
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("JWT has expired");
  if (payload.iss && payload.iss !== `${supaUrl}/auth/v1`) throw new Error("Invalid issuer");

  const jwks = await loadJwks(supaUrl);
  const jwk = jwks.keys?.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`JWT signing key not found: ${header.kid ?? "missing kid"}`);
  const algorithm = cryptoAlg(header.alg);
  const key = await crypto.subtle.importKey("jwk", jwk, algorithm, true, ["verify"]);
  const valid = await crypto.subtle.verify(algorithm, key, base64UrlToBytes(rawSignature), enc.encode(`${rawHeader}.${rawPayload}`));
  if (!valid) throw new Error("Invalid JWT signature");
  return payload;
}

// ---------- Aliyun V3 (ACS3-HMAC-SHA256) signing ----------
const enc = new TextEncoder();
async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacSha256Hex(key: string | Uint8Array, msg: string): Promise<string> {
  const keyBytes = typeof key === "string" ? enc.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callAliyunImageModeration(opts: {
  ak: string; sk: string; region: string; service: string; imageUrl: string;
}): Promise<{ ok: boolean; status: number; raw: any; requestId?: string }> {
  const host = `green-cip.${opts.region}.aliyuncs.com`;
  const action = "ImageModeration";
  const version = "2022-03-02";
  // 阿里云 ACS3-HMAC-SHA256 要求 ISO8601 扩展格式：2026-05-10T12:18:38Z（保留 - 和 :，去掉毫秒）
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const bodyObj = {
    Service: opts.service,
    ServiceParameters: JSON.stringify({ imageUrl: opts.imageUrl, dataId: nonce }),
  };
  const body = JSON.stringify(bodyObj);
  const bodyHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host,
    "x-acs-action": action,
    "x-acs-version": version,
    "x-acs-date": date,
    "x-acs-signature-nonce": nonce,
    "x-acs-content-sha256": bodyHash,
    "content-type": "application/json; charset=utf-8",
  };

  // Canonical request
  const sortedKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headers[k].trim()}\n`).join("");
  const signedHeaders = sortedKeys.join(";");
  const canonicalRequest =
    "POST\n/\n\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + bodyHash;

  const stringToSign = "ACS3-HMAC-SHA256\n" + (await sha256Hex(canonicalRequest));
  const signature = await hmacSha256Hex(opts.sk, stringToSign);
  const authorization =
    `ACS3-HMAC-SHA256 Credential=${opts.ak},SignedHeaders=${signedHeaders},Signature=${signature}`;

  const resp = await fetch(`https://${host}/`, {
    method: "POST",
    headers: { ...headers, Authorization: authorization, "x-acs-action": action },
    body,
    signal: AbortSignal.timeout(35000),
  });
  const txt = await resp.text();
  let raw: any = {};
  try { raw = JSON.parse(txt); } catch { raw = { raw_text: txt.slice(0, 500) }; }
  return { ok: resp.ok, status: resp.status, raw, requestId: raw?.RequestId };
}

// 解析阿里云 aigcCheck_pro 返回，归一到 0-1 概率。
// 旗舰版返回示例：{ Code: 200, Data: { Result: [{ Label: "ai", Confidence: 92.3, Description: "..." }, ...], RiskTips, RiskWords } }
// 若顶层非 200，视为错误。
function parseAliyunResult(raw: any): { score: number; labels: string[]; suspectedModels: { name: string; score: number }[]; topLabel: string } {
  const data = raw?.Data ?? {};
  const results: any[] = Array.isArray(data?.Result) ? data.Result : [];
  let aiScore = 0;
  const labels: string[] = [];
  const suspectedModels: { name: string; score: number }[] = [];
  for (const r of results) {
    const label = String(r?.Label ?? "").toLowerCase();
    const conf = Math.max(0, Math.min(100, Number(r?.Confidence ?? 0))) / 100;
    if (label) labels.push(`${label}:${(conf * 100).toFixed(1)}%`);
    // 阿里云 aigcDetector_ultra 实际返回 risk_aigc / risk_edit / nonLabel 等标签；
    // 同时兼容旧的 ai / aigc / fake / generated 等命名
    if (/(risk_aigc|risk_edit|^ai$|^aigc|^fake|^generated|^ai_generated|^sd|^midjourney|^seedream|^flux|^kling)/.test(label)) {
      aiScore = Math.max(aiScore, conf);
      // 旗舰版有时把模型名写在 Description / SubLabels
      const desc = `${r?.Description ?? ""} ${JSON.stringify(r?.SubLabels ?? "")}`;
      const m = desc.match(/(midjourney|stable\s*diffusion|\bsd\b|flux|seedream|豆包|通义万相|wanxiang|kling|可灵|dalle|sora)/i);
      if (m) suspectedModels.push({ name: m[0], score: conf });
      else suspectedModels.push({ name: label, score: conf });
    }
  }
  // 兜底：若 Result 里没解析到分数，但顶层 RiskLevel 已明确给出风险等级，按等级给一个保守估计
  if (aiScore === 0) {
    const riskLevel = String(data?.RiskLevel ?? raw?.RiskLevel ?? "").toLowerCase();
    if (riskLevel === "high") aiScore = 0.92;
    else if (riskLevel === "medium") aiScore = 0.65;
    else if (riskLevel === "low") aiScore = 0.35;
    if (aiScore > 0) labels.push(`riskLevel:${riskLevel}`);
  }
  const topLabel = aiScore >= 0.5 ? "aigc" : "real";
  return { score: aiScore, labels, suspectedModels, topLabel };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supaUrl || !serviceKey) return json({ error: "检测服务配置不完整" }, 500);
    const ak = Deno.env.get("ALIYUN_AK_ID");
    const sk = Deno.env.get("ALIYUN_AK_SECRET");
    const region = Deno.env.get("ALIYUN_GREEN_REGION") || "cn-shanghai";
    const service = Deno.env.get("ALIYUN_AIGC_SERVICE") || "aigcDetector_ultra";
    if (!ak || !sk) return json({ error: "ALIYUN_AK_ID / ALIYUN_AK_SECRET 未配置" }, 500);

    const auth = req.headers.get("Authorization") ?? "";
    const isService = auth === `Bearer ${serviceKey}`;

    let callerId: string | null = null;
    if (!isService) {
      if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const token = auth.slice("Bearer ".length);
      let claims: JwtClaims;
      try {
        claims = await verifyJwtLocally(token, supaUrl);
      } catch (e) {
        console.error("[aigc-detect] JWT verify failed:", (e as Error).message);
        return json({ error: "Unauthorized" }, 401);
      }
      callerId = claims.sub as string;
    }

    const parsedBody = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsedBody.success) return json({ error: "申请编号或重新鉴别参数无效" }, 400);
    const { application_id, force } = parsedBody.data;

    const admin = createClient(supaUrl, serviceKey, {
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(12000) }) },
    });

    const { data: app, error: appErr } = await admin
      .from("applications")
      .select("id, student_id, file_path, college_id, aigc_status, status, ai_intended_auto_approve, ai_suggested_credit, ai_reasoning, final_credit")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr || !app) return json({ error: "application not found" }, 404);

    // 手动重试仅限本学院审核人员；先验证权限，再返回任何历史结果。
    if (!isService && (force || callerId !== app.student_id)) {
      const { data: roles } = await admin.from("user_roles").select("role, college_id").eq("user_id", callerId);
      const ok = canReviewDetection(roles ?? [], app.college_id);
      if (!ok) return json({ error: "forbidden" }, 403);
    }

    // 自动唤起仍保持幂等，明确的手动重试才会重新调用鉴别服务。
    if (shouldSkipDetection(app.aigc_status, force)) {
      return json({ skipped: true, reason: "already_processed", status: app.aigc_status });
    }

    // 学院阈值
    let suspectTh = DEFAULT_SUSPECT, fakeTh = DEFAULT_FAKE, enabled = true;
    if (app.college_id) {
      const { data: col } = await admin.from("colleges").select("theme").eq("id", app.college_id).maybeSingle();
      const cfg = (col?.theme as any)?.aigc;
      if (cfg) {
        if (typeof cfg.suspect === "number") suspectTh = cfg.suspect;
        if (typeof cfg.fake === "number") fakeTh = cfg.fake;
        if (cfg.enabled === false) enabled = false;
      }
    }

    const writeResult = async (patch: Record<string, unknown>) => {
      const { error } = await admin.from("applications").update({
        ...patch,
        aigc_checked_at: new Date().toISOString(),
        aigc_provider: `aliyun:${service}`,
      }).eq("id", application_id);
      if (error) throw error;
    };

    // 当 AIGC 跳过 / 出错时，若 AI 评估本意是自动通过，则就此兑现。
    const promoteIfIntended = async () => {
      if (app.ai_intended_auto_approve && app.status === "pending_review") {
        await admin.from("applications").update({
          status: "auto_approved",
          final_credit: app.ai_suggested_credit,
          reviewed_at: new Date().toISOString(),
          review_source: "ai",
          ai_intended_auto_approve: false,
        }).eq("id", application_id);
      }
    };

    if (!enabled) {
      await writeResult({ aigc_status: "skipped", aigc_score: null, aigc_detail: { reason: "disabled by college config" } });
      await promoteIfIntended();
      return json({ status: "skipped", note: "AIGC 检测已被学院关闭" });
    }

    // 取待检测图片：优先用附件表第一份材料（PDF 用其第 1 页预览图），回退旧版单附件字段
    let targetPath: string | null = null;
    const { data: atts } = await admin
      .from("application_attachments")
      .select("file_path")
      .eq("application_id", application_id)
      .order("sort_order", { ascending: true })
      .limit(1);
    const first = atts?.[0]?.file_path ?? null;
    if (first && /\.pdf$/i.test(first)) targetPath = `${first}.p1.jpg`;
    else if (first && IMAGE_EXT.test(first)) targetPath = first;
    else if (app.file_path && IMAGE_EXT.test(app.file_path)) targetPath = app.file_path;

    if (!targetPath) {
      await writeResult({ aigc_status: "skipped", aigc_score: null, aigc_detail: { reason: "not an image" } });
      await promoteIfIntended();
      return json({ status: "skipped", note: "非图片附件，无需 AIGC 检测" });
    }

    const { data: signed } = await admin.storage.from("application-files").createSignedUrl(targetPath, 300);
    const imageUrl = signed?.signedUrl;
    if (!imageUrl) {
      await writeResult({ aigc_status: "error", aigc_score: null, aigc_detail: { reason: "no signed url" } });
      await promoteIfIntended();
      return json({ status: "error", note: "无法生成图片访问链接" });
    }

    console.log("[aigc-detect] requesting provider", { application_id, force });
    let aly: Awaited<ReturnType<typeof callAliyunImageModeration>>;
    try {
      aly = await callAliyunImageModeration({ ak, sk, region, service, imageUrl });
    } catch (e) {
      const msg = e instanceof Error && /timeout|abort/i.test(`${e.name} ${e.message}`)
        ? "阿里云鉴别服务响应超时，本次未获得鉴别结果，请稍后重试。"
        : "连接阿里云鉴别服务失败，本次未获得鉴别结果，请稍后重试。";
      await writeResult({ aigc_status: "error", aigc_score: null, aigc_detail: { error: msg } });
      console.warn("[aigc-detect] provider unavailable", { application_id });
      return json({ status: "error", note: msg }, 504);
    }
    console.log("[aigc-detect] provider returned", { application_id, http_status: aly.status, code: aly.raw?.Code });
    if (!aly.ok || (aly.raw?.Code && aly.raw.Code !== 200)) {
      const msg = `阿里云 [${aly.status}] ${JSON.stringify(aly.raw).slice(0, 300)}`;
      await writeResult({ aigc_status: "error", aigc_score: null, aigc_detail: { error: msg, request_id: aly.requestId } });
      await promoteIfIntended();
      return json({ status: "error", note: msg }, 500);
    }

    const parsed = parseAliyunResult(aly.raw);
    let aigc_status: "real" | "suspect" | "fake";
    if (parsed.score >= fakeTh) aigc_status = "fake";
    else if (parsed.score >= suspectTh) aigc_status = "suspect";
    else aigc_status = "real";

    const detail = {
      provider: "aliyun",
      service,
      region,
      labels: parsed.labels,
      suspected_models: parsed.suspectedModels.slice(0, 5),
      request_id: aly.requestId,
      thresholds: { suspect: suspectTh, fake: fakeTh },
      raw: aly.raw,
    };

    await writeResult({
      aigc_status,
      aigc_score: Number(parsed.score.toFixed(3)),
      aigc_detail: detail,
    });

    // 新流程：AI 评估先跑；本函数在评估完成后被触发，依据 AIGC 结论"揭晓最终结论"。
    const fakeNote = `阿里云 AIGC 鉴别一票否决：检测到该图片为 AI 生成（概率 ${(parsed.score * 100).toFixed(1)}%）。请提交真实证书原件照片。`;
    const suspectNote = `阿里云 AIGC 鉴别：疑似 AI 生成（概率 ${(parsed.score * 100).toFixed(1)}%），已转人工复核。`;
    const realNote = `阿里云 AIGC 鉴别：AI 生成概率 ${(parsed.score * 100).toFixed(1)}%，未发现明显 AI 生成痕迹。`;

    const appendReasoning = (note: string) =>
      `${app.ai_reasoning ?? ""}${app.ai_reasoning ? "\n\n" : ""}【AIGC 鉴别】${note}`;

    if (aigc_status === "fake") {
      // 一票否决：覆盖 AI 评估结论
      await admin.from("applications").update({
        status: "rejected_by_ai",
        ai_reasoning: appendReasoning(fakeNote),
        ai_reasoning_short: "AI 生成图，已拒",
        ai_check_authenticity: false,
        ai_intended_auto_approve: false,
        final_credit: null,
        reviewed_at: null,
      }).eq("id", application_id);
    } else if (aigc_status === "suspect") {
      // 疑似 → 保持 / 降级到人工复核
      const patch: Record<string, unknown> = {
        ai_reasoning: appendReasoning(suspectNote),
        ai_intended_auto_approve: false,
      };
      if (app.status === "auto_approved" || app.ai_intended_auto_approve) {
        patch.status = "pending_review";
        patch.final_credit = null;
        patch.reviewed_at = null;
      }
      await admin.from("applications").update(patch).eq("id", application_id);
    } else {
      // real / skipped / error 这里能到的只是 real（前面 skipped/enabled/error 已 return）；
      // 若 AI 评估本意是自动通过，此时兑现。
      const patch: Record<string, unknown> = {
        ai_reasoning: appendReasoning(realNote),
      };
      if (app.ai_intended_auto_approve && app.status === "pending_review") {
        patch.status = "auto_approved";
        patch.final_credit = app.ai_suggested_credit;
        patch.reviewed_at = new Date().toISOString();
        patch.review_source = "ai";
        patch.ai_intended_auto_approve = false;
      }
      await admin.from("applications").update(patch).eq("id", application_id);
    }

    return json({ status: aigc_status, score: parsed.score, suspected_models: parsed.suspectedModels });
  } catch (e) {
    console.error("[aigc-detect] error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});