import { deserializeItems } from "@/lib/parseForm";
import { toPlainText } from "@/lib/sanitizeMarkdown";

/** Presentation only: never change the stored application or its reported credits. */
export function applicationDescription(description: string | null | undefined, compact = false): string {
  if (!description) return "未填写申请说明";
  const items = deserializeItems(description);
  if (items.length > 0) {
    if (compact) return items.map(item => item.achievement || item.project || "未填写成果名称").join("、");
    return items.map((item, index) => [
      `第 ${index + 1} 条：${item.achievement || "未填写成果名称"}`,
      `类别：${item.category || "未分类"}；认定项目：${item.project || "未填写"}`,
      `认定级别：${item.level || "未填写"}；本人排名：${item.rank || "未填写"}；申报学分：${item.credit ?? "未填写"}${item.credit != null ? " 分" : ""}`,
    ].join("\n")).join("\n\n");
  }
  // Invalid structured data must not leak JSON into legacy description surfaces.
  if (/^\s*[\[{]/.test(description)) return "申请条目信息暂时无法显示，请查看上传的申请表。";
  return toPlainText(description);
}