import { normalizeKeyword } from "./keywords";

/**
 * 旧版：把 selected + custom 关键词合并 → 规范化 → 去空 → 去重 → 排序 → join('|')
 * 用于检测同一学生是否已存在「关键词集合完全相同」的已通过申请。
 */
export function buildKeywordsFingerprint(
  selected: string[],
  custom: string[],
): string {
  const all = [...(selected ?? []), ...(custom ?? [])];
  const set = new Set<string>();
  for (const raw of all) {
    const n = normalizeKeyword(raw);
    if (n) set.add(n);
  }
  return Array.from(set).sort().join("|");
}

/**
 * 新版（填表流程）：按「成果名称 + 认定级别」生成指纹。
 * 依据《认定办法》第八条：同一成果不得重复认定（只认最高级）；
 * 不同作品参加同一比赛可累计 —— 所以指纹不含认定项目/大类，
 * 同一项目名重复出现不会被拦截。
 */
export function buildAchievementFingerprint(
  achievement: string,
  level: string,
): string {
  const a = normalizeKeyword(achievement) ?? "";
  const l = normalizeKeyword(level) ?? "";
  if (!a) return "";
  return `${a}|${l}`;
}
