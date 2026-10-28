const FILLERS = [
  /^作为\s*AI\s*助手[，,。：:]?\s*/,
  /^根据您提供的信息[，,。：:]?\s*/,
  /^我将为您[^\n。.]*[。.]?\s*/,
  /^好的[，,。：:]?\s*/,
  /^以下是[^\n：:]*[：:]\s*/,
];

// 装饰性「AI 感」字符：带圈数字、装饰 emoji、提示性图标。这些只用于排版气氛，
// 在纯文本气泡和 markdown 渲染中都会显得突兀，统一剥离。
const KEYCAP_DIGITS = /[\u0030-\u0039]\uFE0F?\u20E3/g; // 1️⃣ 2️⃣ ... 0️⃣
const DECOR_EMOJI = /[⚠️📎👇✅❌🎉🤖💡⭐️✨📝📌🔔ℹ️👉👆👀]/g;

// 数据库字段/表名 -> 中文显示名。用于把后端泄漏的英文标识翻译成自然中文。
// 顺序很重要：长 key 必须排在短 key 之前，避免被部分匹配。
const FIELD_LABELS: Array<[RegExp, string]> = [
  [/\b(?:ai_check_)?consistency(?:_ok)?\b/g, "材料一致性"],
  [/\b(?:ai_check_)?relevance(?:_ok)?\b/g, "材料相关性"],
  [/\b(?:ai_check_)?authenticity(?:_ok)?\b/g, "材料真实性"],
  [/\b(?:ai_check_)?name_match(?:_ok)?\b/g, "姓名一致性"],
  [/\b(?:ai_check_)?identity_match(?:_ok)?\b/g, "身份信息一致性"],
  [/\b(?:ai_check_)?logic(?:_ok)?\b/g, "逻辑合理性"],
  [/\b(?:ai_check_)?completeness(?:_ok)?\b/g, "材料完整性"],
  [/\bai_suggested_credit\b/g, "系统建议学分"],
  [/\bclaimed_credit\b/g, "申报合计学分"],
  [/\bfinal_credit\b/g, "最终学分"],
  [/\bai_reasoning_short\b/g, "核对摘要"],
  [/\bai_reasoning\b/g, "核对理由"],
  [/\bai_confidence\b/g, "判定确信度"],
  [/\bai_detected_school\b/g, "识别学校"],
  [/\bai_detected_student_no\b/g, "识别学号"],
  [/\bai_override_note\b/g, "系统改判说明"],
  [/\bteacher_review\b/g, "教师复核"],
  [/\badmin_review\b/g, "管理员复核"],
  [/\bai_evaluation\b/g, "系统核验"],
  [/\bstudent_appeal\b/g, "学生申诉"],
  [/\breviewer_recall\b/g, "教师撤回"],
  [/\bauto_approved\b/g, "系统初审通过"],
  [/\brejected_by_ai\b/g, "系统未通过"],
  [/\bpending_review\b/g, "待教师复核"],
  [/\bpending_ai\b/g, "系统核验中"],
  [/\bapproved\b/g, "已通过"],
  [/\brejected\b/g, "已驳回"],
  [/\bAIGC\b/gi, "人工智能生成"],
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
  [/\bid_card\b/g, "身份证号"],
  [/\buser_id\b/g, "用户编号"],
  [/\bapplication_id\b/g, "申请编号"],
  [/\bsubmitted_at\b/g, "提交时间"],
  [/\bcreated_at\b/g, "创建时间"],
  [/\bdepartment\b/g, "院系"],
  [/\bmajor\b/g, "专业"],
  [/\bphone\b/g, "手机号"],
  [/\bpassword\b/g, "密码"],
  [/\bgender\b/g, "性别"],
  [/\bethnicity\b/g, "民族"],
  [/\badvisor\b/g, "辅导员"],
  [/\bemail\b/g, "邮箱"],
  // 表名
  [/\bcolleges\b/g, "学院名单"],
  [/\buser_roles\b/g, "角色记录"],
  [/\bprofiles\b/g, "用户档案"],
  [/\bapplications\b/g, "申请记录"],
];

/** 把英文字段名 / 表名翻译为中文显示名。 */
export function translateFieldNames(input: string): string {
  if (!input) return "";
  let s = String(input);
  // Translate boolean comparisons before stripping formatting so the result remains meaningful.
  s = s.replace(/\b((?:ai_check_)?(?:consistency|relevance|authenticity|name_match|identity_match|logic|completeness)(?:_ok)?)\b["'`\s]*(?:为|是|[:=：])\s*(true|false|null)\b/gi,
    (_, field: string, value: string) => `${field}：${value.toLowerCase() === "true" ? "符合" : value.toLowerCase() === "false" ? "不符合" : "未给出判断"}`);
  for (const [re, zh] of FIELD_LABELS) s = s.replace(re, zh);
  s = s.replace(/\bfalse\b/g, "否").replace(/\btrue\b/g, "是").replace(/\bnull\b/g, "未填写");
  return s;
}

export function sanitizeMarkdown(input: string): string {
  if (!input) return "";
  let s = String(input).trim();
  s = s.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  s = s.replace(/^[ \t]*([*\-=_]\s*){3,}[ \t]*$/gm, "---");
  s = s.replace(/^\s*\|\s*$/gm, "");
  s = s.replace(/\r\n/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  for (const re of FILLERS) s = s.replace(re, "");
  s = s.replace(/^[ \t]*[•·]\s+/gm, "- ");
  s = s.replace(KEYCAP_DIGITS, "").replace(DECOR_EMOJI, "");
  // 去掉 markdown 强调符号，避免渲染成「AI 感」加粗/斜体
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  s = s.replace(/__([^_\n]+)__/g, "$1");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
  s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1$2");
  // 移除括号中包含的英文路径/URL，例如：规则库（/admin/rules）或 (https://...)
  s = s.replace(/[（(]\s*(?:https?:\/\/)?\/[A-Za-z0-9\-_\/?=&%.]+\s*[)）]/g, "");
  // 移除 markdown 链接中的英文路径目标，仅保留链接文本：[规则库](/admin/rules) -> 规则库
  s = s.replace(/\[([^\]]+)\]\((?:https?:\/\/)?\/[A-Za-z0-9\-_\/?=&%.]+\)/g, "$1");
  // 清理因移除导致的多余空格
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\s+([，。、；：!?])/g, "$1");
  s = translateFieldNames(s);
  return s.trim();
}

/**
 * 把任何文本（含 AI 回复）转成「干净的纯文本」：
 * - 去掉 markdown 强调符 ** __ * _（保留内部文字）
 * - 去掉行首 # > 标记
 * - 去掉装饰性 emoji 和带圈数字
 * 用于不走 ReactMarkdown 渲染、直接 {text} 显示的气泡。
 */
export function toPlainText(input: string): string {
  if (!input) return "";
  let s = String(input);
  s = s.replace(/```(?:[a-z]+)?\s*\n?/gi, "").replace(/`([^`\n]+)`/g, "$1");
  // 强调符：**bold** / __bold__ / *italic* / _italic_
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  s = s.replace(/__([^_\n]+)__/g, "$1");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
  s = s.replace(/(^|[^_\w])_([^_\n]+)_/g, "$1$2");
  // 行首 markdown 标记
  s = s.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  s = s.replace(/^\s{0,3}>\s?/gm, "");
  // 装饰 emoji & 带圈数字
  s = s.replace(KEYCAP_DIGITS, "").replace(DECOR_EMOJI, "");
  // 链接：[文本](url) -> 文本
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // 多余空格 / 空行
  s = s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  // 把残留的字段名/表名翻译成中文
  s = translateFieldNames(s);
  return s.trim();
}
