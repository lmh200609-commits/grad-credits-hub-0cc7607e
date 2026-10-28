import { toPlainText, translateFieldNames } from "@/lib/sanitizeMarkdown";

const LABELS: Record<string, string> = {
  index: "序号", category: "类别", project: "认定项目", achievement: "成果名称",
  level: "认定级别", rank: "本人排名", credit: "学分", items: "申请条目",
  reasoning: "核对理由", summary: "核对摘要", decision: "判定结果", confidence: "判定确信度",
  checks: "核对结果", issues: "发现的问题", errors: "失败详情", error: "失败原因",
  message: "说明", note: "说明", status: "状态", name: "名称", active: "是否启用",
  before: "修改前", after: "修改后", payload: "操作内容", profile: "用户资料",
  source: "来源", count: "数量", total: "总数", created: "已创建", skipped: "已跳过",
  failed: "失败", success: "成功", failure: "失败", attempts: "尝试次数", last_error: "最近失败原因",
  request_id: "调用编号", provider: "服务提供方", service: "检测服务", region: "服务区域",
  role: "角色", roles: "角色", super_admin: "超级管理员", admin: "学院管理员",
  teacher: "教师", student: "学生", manual: "人工录入", ai: "系统生成", rule: "规则",
  result: "结果", detected: "识别内容", override: "改判说明", matched_rule_id: "匹配规则编号",
};

export function displayLabel(key: string): string {
  const label = LABELS[key] ?? translateFieldNames(key);
  return /^[a-z][a-z0-9_]*$/i.test(label) ? "其他信息" : label;
}

export function displayValue(value: unknown): string {
  if (value == null) return "未填写";
  if (value === true) return "是";
  if (value === false) return "否";
  if (Array.isArray(value)) return value.map((v, i) => `${i + 1}. ${displayValue(v)}`).join("\n");
  if (typeof value === "object") return Object.entries(value).map(([key, v]) => `${displayLabel(key)}：${displayValue(v)}`).join("\n");
  const text = String(value);
  return LABELS[text] ?? toPlainText(text);
}

/** Decode structured model output without displaying JSON syntax. */
export function displayReason(input: string | null | undefined): string {
  if (!input) return "";
  const text = input.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (/^[\[{]/.test(text)) {
    try { return displayValue(JSON.parse(text)); }
    catch { return "核对说明暂时无法显示，请查看上方逐项核对结果。"; }
  }
  return toPlainText(input);
}

/** Synchronous presentation fallback, shared by historical errors and notifications. */
export function displayError(input: string): string {
  if (/failed to fetch|networkerror|network request failed|err_network/i.test(input)) return "网络连接失败，请检查网络后重试。";
  if (/timeout|timed out|aborted|etimedout/i.test(input)) return "请求超时，请稍后重试。";
  if (/jwt|token.*expired|invalid token/i.test(input)) return "登录已过期，请重新登录。";
  if (/permission denied|unauthorized|forbidden|row.?level security/i.test(input)) return "当前账号没有执行此操作的权限。";
  if (/duplicate key|unique constraint|already exists/i.test(input)) return "记录已存在，请勿重复提交。";
  if (/image.*(?:download|read|fetch)|invalid.*image|图片.*(?:读取|下载).*失败/i.test(input)) return "读取佐证图片失败，请检查材料后重试。";
  if (/rate.?limit|429|too many requests/i.test(input)) return "请求过于频繁，请稍后重试。";
  if (/quota|insufficient.*balance|payment required/i.test(input)) return "检测服务额度不足，请联系管理员处理。";
  if (/invalid.*(?:api.?key|access.?key)|invalidaccesskey|signaturedoesnotmatch|401/i.test(input)) return "检测服务密钥无效，请管理员检查密钥配置。";
  if (/internal server error|bad gateway|service unavailable|non-2xx|502|503/i.test(input)) return "服务暂时不可用，请稍后重试。";
  const text = displayReason(input);
  if (!/[\u3400-\u9fff]/.test(text) || /\b(?:Error|TypeError|ReferenceError|SyntaxError|SELECT|INSERT|UPDATE|DELETE|stack|undefined)\b|\bat\s+\w+\s*\(|https?:\/\/|\{[\s\S]*\}/i.test(text)) {
    return "操作未完成，服务返回异常，请稍后重试。";
  }
  return text;
}