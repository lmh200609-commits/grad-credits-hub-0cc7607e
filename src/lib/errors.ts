import { toast as sonnerToast } from "sonner";
import { toast as legacyToast } from "@/hooks/use-toast";
import { displayError } from "@/lib/displayText";

/**
 * 统一错误翻译 & 红色提示
 *
 * 用法：
 *   try { ... } catch (e) { toastError(e); }
 *   try { ... } catch (e) { toastError(e, "保存失败"); }
 *
 * 也可以拿到结构化结果自行展示：
 *   const { title, description } = await explainError(e);
 */

export type ExplainedError = { title: string; description: string };

/** 常见英文/技术错误关键词 → 中文说明 */
const PATTERN_MAP: Array<{ test: RegExp; title: string; description: string }> = [
  // 网络
  { test: /failed to fetch|networkerror|network request failed|err_network|err_internet_disconnected/i,
    title: "网络连接失败", description: "无法连接到服务器，请检查网络后重试。" },
  { test: /aborted|timeout|timed out|etimedout/i,
    title: "请求超时", description: "服务器响应较慢，请稍后再试。" },

  // 登录 / 权限
  { test: /jwt expired|jwt is expired|token has expired|invalid jwt|invalid token|refresh.*token.*not.*found|pgrst301/i,
    title: "登录已过期", description: "请重新登录后再继续操作。" },
  { test: /permission denied|not.*authorized|unauthorized|forbidden|row.?level security|rls/i,
    title: "没有权限", description: "当前账号无权执行该操作。" },

  // 数据
  { test: /duplicate key|already exists|unique constraint|23505/i,
    title: "数据重复", description: "该记录已存在，请勿重复提交。" },
  { test: /foreign key|violates foreign key|23503/i,
    title: "存在关联数据", description: "该数据被其它记录引用，无法删除或修改。" },
  { test: /not.?null|23502/i,
    title: "信息不完整", description: "有必填项为空，请补全后再试。" },
  { test: /pgrst116|no rows|not found|404/i,
    title: "未找到数据", description: "对应的数据不存在或已被删除。" },

  // 文件
  { test: /payload too large|413|file.*too.*large|exceeds.*size/i,
    title: "文件过大", description: "请压缩或缩小文件后重试。" },
  { test: /unsupported.*type|invalid.*mime|unsupported.*format/i,
    title: "文件格式不支持", description: "请使用受支持的文件格式后重试。" },

  // AI / 配额
  { test: /rate.?limit|429|too many requests/i,
    title: "请求过于频繁", description: "操作过于频繁，请稍候片刻再试。" },
  { test: /quota|insufficient.?balance|payment required|402/i,
    title: "服务额度不足", description: "AI 服务额度已用尽，请联系管理员充值。" },

  // 服务端通用
  { test: /internal server error|500/i,
    title: "服务异常", description: "服务器出现内部错误，请稍后再试。" },
  { test: /service unavailable|503|502|bad gateway/i,
    title: "服务暂时不可用", description: "服务正在恢复中，请稍后再试。" },
];

function looksLikeEnglish(s: string): boolean {
  return !!s && /^[\x00-\x7F\s]+$/.test(s) && /[a-zA-Z]/.test(s);
}

function mapByPattern(text: string): ExplainedError | null {
  for (const m of PATTERN_MAP) if (m.test.test(text)) {
    return { title: m.title, description: m.description };
  }
  return null;
}

/** 把 supabase.functions.invoke 失败时藏在 error.context 里的真实响应抽出来。 */
async function readFunctionContext(ctx: unknown): Promise<string | null> {
  if (!ctx || typeof ctx !== "object") return null;
  // FunctionsHttpError.context 是一个 Response
  const res = ctx as Response;
  if (typeof (res as any).clone !== "function") return null;
  try {
    const cloned = res.clone();
    const text = await cloned.text();
    if (!text) return null;
    try {
      const j = JSON.parse(text);
      return (
        (typeof j?.error === "string" && j.error) ||
        (typeof j?.message === "string" && j.message) ||
        (typeof j?.msg === "string" && j.msg) ||
        text
      );
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

export async function explainError(err: unknown, fallbackTitle = "操作失败"): Promise<ExplainedError> {
  if (err == null) return { title: fallbackTitle, description: "未知错误，请稍后重试。" };

  // 字符串
  if (typeof err === "string") {
    const mapped = mapByPattern(err);
    if (mapped) return mapped;
    return { title: fallbackTitle, description: displayError(err) };
  }

  const anyErr = err as any;

  // Supabase Functions：先读 context 里的真实 JSON
  if (anyErr?.context) {
    const body = await readFunctionContext(anyErr.context);
    if (body) {
      const mapped = mapByPattern(body);
      if (mapped) return mapped;
      // 业务端返回的中文 error 字段直接用
      if (!looksLikeEnglish(body)) {
        return { title: fallbackTitle, description: displayError(body) };
      }
    }
  }

  // PostgrestError：有 code/message/details/hint
  const code = typeof anyErr?.code === "string" ? anyErr.code : "";
  const pgMsg = [anyErr?.message, anyErr?.details, anyErr?.hint].filter(Boolean).join(" | ");
  const composite = `${code} ${pgMsg} ${anyErr?.name ?? ""} ${anyErr?.status ?? ""}`.trim();

  const mapped = mapByPattern(composite);
  if (mapped) return mapped;

  const msg: string = anyErr?.message ?? String(err);
  if (!msg) return { title: fallbackTitle, description: "未知错误，请稍后重试。" };

  // 英文兜底
  if (looksLikeEnglish(msg)) {
    return { title: fallbackTitle, description: "服务暂时不可用，请稍后再试。" };
  }
  return { title: fallbackTitle, description: displayError(msg) };
}

/** 红色提示（基于 sonner）。 */
export function toastError(err: unknown, fallbackTitle = "操作失败"): void {
  void explainError(err, fallbackTitle).then(({ title, description }) => {
    sonnerToast.error(title, { description });
  });
}

/** 红色提示（基于旧版 useToast，destructive variant）。 */
export function toastErrorLegacy(err: unknown, fallbackTitle = "操作失败"): void {
  void explainError(err, fallbackTitle).then(({ title, description }) => {
    legacyToast({ title, description, variant: "destructive" });
  });
}
