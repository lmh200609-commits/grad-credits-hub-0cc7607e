// 用户提供的《长春财经学院创新实践学分认定标准》（2026-10-20）
// 用于：学生自报学分合规校验、教师端标准学分参考、成绩等级评定。
//
// 匹配策略：按「大类 → 认定项目 → 成果/级别关键词 → 排名关键词」依次收敛；
// 匹配不到返回 null（unknown），不误报。

import { Catalogs, EMPTY_CATALOGS, matchCertificate, matchCompetition } from "./catalog";

export type CreditCompliance = "ok" | "over" | "under" | "unknown";

export interface StandardLookup {
  credit: number | null;      // 标准学分（无法确定档位时为 null）
  min?: number;               // 档位区间（如按排名有多个档位）
  max?: number;
  basis: string;              // 依据描述，如「学科竞赛·国家级B类·一等奖·团队负责人」
  matched: boolean;
  catalogName?: string;       // 命中的名录条目（赛事/证书标准名称）
  normalizedLevel?: string;   // 归一后的级别档
}

export interface LookupInput {
  category: string;
  project: string;
  achievement: string;
  level: string;
  rank: string;
}

const has = (s: string, ...keys: string[]) => keys.some((k) => s.includes(k));

/** 级别写法归一：国家级C类 / 国际级C类 按省部级A类降档计分 */
export function normalizeLevel(raw: string): string | null {
  const s = (raw || "").replace(/\s|（|）|\(|\)/g, "");
  if (!s) return null;
  if (has(s, "国际级C", "国际C", "国家级C", "国家C")) return "省部级A类";
  if (has(s, "国家级A", "国家A", "国际级A", "国际A")) return "国家级A类";
  if (has(s, "国家级B", "国家B", "国际级B", "国际B")) return "国家级B类";
  if (has(s, "国家", "全国", "国际")) return null;
  if (has(s, "省") || has(s, "部")) {
    if (has(s, "C类") || /省级?C/.test(s)) return "校级";
    if (has(s, "B类") || /省级?B/.test(s)) return "省部级B类";
    return has(s, "A类") || /省级?A/.test(s) ? "省部级A类" : null;
  }
  if (has(s, "市")) return null;
  if (has(s, "校", "院")) return "校级";
  return null;
}

/** 奖次归一：特等/一等/金奖→1，二等/银奖→2，三等/铜奖→3；优秀奖不认定，其余 null */
export function normalizePrize(raw: string): 1 | 2 | 3 | null {
  const s = raw || "";
  if (has(s, "特等", "一等", "金奖", "冠军", "第一名")) return 1;
  if (has(s, "二等", "银奖", "亚军", "第二名")) return 2;
  if (has(s, "三等", "铜奖", "季军", "第三名")) return 3;
  return null;
}

// 排名不明确时只提供区间，不默认按负责人计分。
const missingRank = (s: string) => !s || has(s, "未填写", "未识别");
const LEADER_KEYS = ["负责人", "主持人", "队长", "独立", "个人"];

export function lookupStandardCredit(input: LookupInput, catalogs: Catalogs = EMPTY_CATALOGS): StandardLookup {
  const first = lookupOnce(input, catalogs);
  if (first.matched) return first;
  // 名录命中但所在大类未覆盖该级别（如互联网+校赛）→ 按学科竞赛档位再试一次
  const comp = matchCompetition(catalogs, `${input.project} ${input.achievement}`);
  if (comp) {
    const retry = lookupOnce({ ...input, category: "学科竞赛" }, catalogs);
    if (retry.matched) return { ...retry, catalogName: comp.name };
    return { credit: null, matched: true, catalogName: comp.name, basis: `${comp.name}：级别或奖次未能确定，需教师核定` };
  }
  return first;
}

function lookupOnce(input: LookupInput, catalogs: Catalogs): StandardLookup {

  let cat = input.category || "";
  const proj = `${input.project} ${input.achievement}`;
  const achieve = input.achievement || "";
  const rank = input.rank || "";

  // 名录识别：赛事名录（识别标准赛事及简称）/ 证书名录
  const comp = matchCompetition(catalogs, proj);
  const cert = !comp ? matchCertificate(catalogs, proj) : null;
  // 学生大类填写不明确（未分类/其他）时，采用名录中的大类
  if (comp && (!cat || has(cat, "其他", "未分类"))) cat = comp.category || cat;

  if (cert) cat = "职业技能";

  // 级别归一：国家级C类/国际级C类 按省部级A类降档
  const level = normalizeLevel(input.level) ?? comp?.default_level ?? input.level ?? "";
  const catalogName = comp?.name ?? cert?.name;
  const basisHead = `${cat || "未分类"}·${catalogName ?? input.project ?? "未填写"}`;

  const fail: StandardLookup = { credit: null, basis: "", matched: false, catalogName, normalizedLevel: normalizeLevel(input.level) ?? undefined };

  // 学生自填的「其他」项目：一律交教师核定
  if (has(cat, "其他") && !comp) {
    return { credit: null, matched: true, basis: `${basisHead}：名录外项目，需教师核定` };
  }


  // ============ 一、教学科研 ============
  if (has(cat, "教学科研", "科研")) {
    // 发表论文
    if (has(proj, "论文", "发表")) {
      const first = has(rank, "第一作者", "一作", "独立") || (has(rank, "指导教师", "导师") && has(rank, "第二作者", "通讯作者"));
      if (missingRank(rank)) return { credit: null, min: 4, max: 10, matched: true, basis: `${basisHead}：作者排名待核对` };
      if (has(input.level + achieve, "SCI", "SSCI", "CSSCI"))
        return ok(first ? 10 : 8, `${basisHead}·SCI/SSCI/CSSCI收录论文·${first ? "第一作者" : "其他作者"}`);
      if (has(input.level + achieve, "EI", "CPCI", "北大核心"))
        return ok(first ? 8 : 6, `${basisHead}·EI/CPCI/北大核心·${first ? "第一作者" : "其他作者"}`);
      if (has(input.level + proj, "普刊", "报刊"))
        return ok(first ? 6 : 4, `${basisHead}·国家级/省级普刊报刊·${first ? "第一作者" : "其他作者"}`);
      return { credit: null, min: 4, max: 10, basis: `${basisHead}·发表论文（4–10 分，视收录与作者序）`, matched: true };
    }
    // 教学科研项目
    if (has(proj, "项目", "课题", "纵向", "横向", "协同育人")) {
      const leader = has(rank, ...LEADER_KEYS);
      if (missingRank(rank)) return { credit: null, min: 2, max: 10, matched: true, basis: `${basisHead}：项目角色待核对` };
      const research = input.level + proj;
      if (has(research, "国家级学会", "行业企业", "省教育厅", "市级纵向", "市级以上纵向") || (has(input.level, "市") && !has(research, "政府", "学会")))
        return ok(leader ? 8 : 6, `${basisHead}·市级以上/行业企业/省教育厅/国家级学会项目`);
      if (has(research, "学会")) return ok(leader ? 4 : 2, `${basisHead}·省级以上学会项目`);
      if ((has(research, "纵向") && has(research, "国家级", "省级", "省级以上")) ||
          (has(research, "横向") && has(research, "政府")) ||
          (has(research, "教育部") && has(research, "协同育人")))
        return ok(leader ? 10 : 8, `${basisHead}·省级以上/政府委托/教育部项目`);
      return { credit: null, min: 2, max: 10, basis: `${basisHead}·科研项目（2–10 分，视级别与角色）`, matched: true };
    }
    // 科学调查研究
    if (has(proj, "调查", "调研", "研究报告", "资政")) {
      if (missingRank(rank)) return { credit: null, min: 1, max: 2, matched: true, basis: `${basisHead}：作者排名待核对` };
      const first = has(rank, "第一作者", "一作", "独立");
      return ok(first ? 2 : 1, `${basisHead}·科学调查研究·${first ? "第一作者" : "其他作者"}`);
    }
    // 知识产权
    if (has(proj, "专利", "著作权", "知识产权", "软件著作")) {
      if (missingRank(rank)) return { credit: null, min: 4, max: 6, matched: true, basis: `${basisHead}：署名排名待核对，第一署名单位须为长春财经学院` };
      const first = has(rank, "第一署名", "独立");
      return ok(first ? 6 : 4, `${basisHead}·知识产权·${first ? "第一署名" : "其他成员"}（第一署名单位须为长春财经学院）`);
    }
    return fail;
  }

  // SIYB/SYB 创业培训合格证书：学院规定一律 4 分
  if (/S?IYB|SYB|创业培训合格/i.test(proj + achieve + input.level + (cert?.name ?? ""))) {
    return ok(4, `${basisHead}·SIYB/SYB创业培训合格证书`);
  }

  // ============ 二、创新创业 ============
  if (has(cat, "创新创业", "创业")) {
    // 大创
    if (has(proj, "大学生创新创业训练", "大创")) {
      if (missingRank(rank)) return { credit: null, min: 1, max: 6, matched: true, basis: `${basisHead}：项目角色待核对，须顺利结题` };
      const leader = has(rank, "主持", "负责人");
      const first = has(rank, "第一参与");
      const slot = (l: number, f: number, o: number) => leader ? l : first ? f : o;
      if (has(input.level, "国家级")) return ok(slot(6, 5, 4), `${basisHead}·大创国家级（须立项且顺利结题）`);
      if (has(input.level, "省级")) return ok(slot(5, 4, 2), `${basisHead}·大创省级（须立项且顺利结题）`);
      if (has(level, "校")) return ok(slot(2, 1, 1), `${basisHead}·大创校级（须立项且顺利结题）`);
      return { credit: null, min: 1, max: 6, basis: `${basisHead}·大创（1–6 分，视级别与角色）`, matched: true };
    }
    // 自主创业
    if (has(proj, "自主创业", "青创空间")) {
      if (missingRank(rank)) return { credit: null, min: 2, max: 4, matched: true, basis: `${basisHead}：项目角色待核对` };
      const leader = has(rank, "负责人", "主持");
      return ok(leader ? 4 : 2, `${basisHead}·自主创业·${leader ? "负责人" : "主要成员"}`);
    }
    // 互联网+ / 挑战杯
    if (has(proj + input.level, "互联网", "挑战杯", "创新创业类竞赛")) {
      if (has(input.level + achieve, "优秀奖")) return ok(0, `${basisHead}·优秀奖不认定`);
      if (missingRank(rank)) return { credit: null, min: 3, max: 10, matched: true, basis: `${basisHead}：竞赛角色待核对` };
      const leader = has(rank, "负责人", "个人", "独立");
      const first = has(rank, "第一参与");
      const slot = (l: number, f: number, o: number) => leader ? l : first ? f : o;
      const prize = prizeOf(input.level + achieve);
      if (has(input.level, "国")) {
        if (prize === 1) return ok(slot(10, 9, 8), `${basisHead}·国赛一等奖`);
        if (prize === 2) return ok(slot(8, 7, 6), `${basisHead}·国赛二等奖`);
        if (prize === 3) return ok(slot(6, 5, 4), `${basisHead}·国赛三等奖`);
      }
      if (has(input.level, "省")) {
        if (prize === 1) return ok(slot(8, 7, 6), `${basisHead}·省赛一等奖`);
        if (prize === 2) return ok(slot(6, 5, 4), `${basisHead}·省赛二等奖`);
        if (prize === 3) return ok(slot(5, 4, 3), `${basisHead}·省赛三等奖`);
      }
      if (has(input.level, "校")) return ok(leader ? 4 : 3, `${basisHead}·校赛`);
      return { credit: null, min: 3, max: 10, basis: `${basisHead}·互联网+/挑战杯（3–10 分）`, matched: true };
    }
    return fail;
  }

  // ============ 三、学科竞赛 ============
  if (has(cat, "学科竞赛", "竞赛", "文体")) {
    if (has(input.level + achieve, "优秀奖")) return ok(0, `${basisHead}·优秀奖不认定`);
    const competitionLevel = normalizeLevel(input.level) ?? normalizeLevel(input.project) ?? normalizeLevel(comp?.default_level ?? "");
    if (!competitionLevel || competitionLevel === "国家级A类" || missingRank(rank)) return { credit: null, matched: true, basis: `${basisHead}：类别或角色待核对` };
    const prize = prizeOf(input.level + achieve);
    // 个人参赛按团队负责人认定（办法备注）
    const isSolo = has(rank, "个人", "独立") ;
    const leader = isSolo || has(rank, "负责人");
    const first = has(rank, "第一参与");
    const slot3 = (l: number, f: number | null, o: number | null) =>
      leader ? l : first && f != null ? f : o;
    if (has(competitionLevel, "国家级")) {
      if (prize === 1) return ok(slot3(8, 7, 6) ?? 6, `${basisHead}·国家级B类一等奖`);
      if (prize === 2) return ok(slot3(7, 6, 5) ?? 5, `${basisHead}·国家级B类二等奖`);
      if (prize === 3) return ok(slot3(5, 4, null) ?? 4, `${basisHead}·国家级B类三等奖`);
    }
    if (has(competitionLevel, "A类") || (has(competitionLevel, "省") && has(competitionLevel, "A"))) {
      if (prize === 1) return ok(slot3(6, null, 5) ?? 5, `${basisHead}·省部级A类一等奖`);
      if (prize === 2) return ok(slot3(5, null, 4) ?? 4, `${basisHead}·省部级A类二等奖`);
      if (prize === 3) return ok(slot3(4, null, 3) ?? 3, `${basisHead}·省部级A类三等奖`);
    }
    if (has(competitionLevel, "B类") || (has(competitionLevel, "省") && has(competitionLevel, "B"))) {
      if (prize === 1) return ok(slot3(6, null, 4) ?? 4, `${basisHead}·省部级B类一等奖`);
      if (prize === 2) return ok(slot3(5, null, 4) ?? 4, `${basisHead}·省部级B类二等奖`);
      if (prize === 3) return ok(slot3(4, null, 2) ?? 2, `${basisHead}·省部级B类三等奖`);
    }
    if (has(competitionLevel, "校")) {
      if (prize === 1) return ok(slot3(5, null, 4) ?? 4, `${basisHead}·校级一等奖`);
      if (prize === 2) return ok(slot3(4, null, 2) ?? 2, `${basisHead}·校级二等奖`);
      if (prize === 3) return ok(slot3(2, null, 1) ?? 1, `${basisHead}·校级三等奖`);
    }
    return { credit: null, min: 1, max: 8, basis: `${basisHead}·学科竞赛（1–8 分，视级别/奖次/角色）`, matched: true };
  }

  // ============ 四、职业技能 ============
  if (has(cat, "职业技能", "技能", "证书")) {
    const text = input.level + achieve + proj + (cert?.level ?? "");
    if (has(text, "六级", "CET-6", "CET6", "专八", "专业八级")) return ok(6, `${basisHead}·六级/专八（须符合专业条件）`);
    if (has(text, "四级", "CET-4", "CET4", "专四", "专业四级")) return ok(4, `${basisHead}·四级/专四（须符合专业条件）`);
    if (has(proj, "第二课堂", "学术报告", "学术研讨", "培训活动", "调研活动")) {
      const hours = text.match(/(\d+(?:\.\d+)?)\s*学时/);
      const weeks = text.match(/(\d+(?:\.\d+)?)\s*周/);
      if (hours) return ok(Number(hours[1]) / 16, `${basisHead}·每16学时1学分（须提供活动证明）`);
      if (weeks) return ok(Number(weeks[1]), `${basisHead}·每1周1学分（须提供活动证明）`);
      return { credit: null, basis: `${basisHead}·第二课堂：每16学时或1周1学分`, matched: true };
    }
    if (has(text, "非全国", "非统一组织")) return ok(2, `${basisHead}·非全国统一行业认证/职业资格`);
    const passRate = text.match(/通过率[^\d]*(\d+(?:\.\d+)?)\s*[%％]/);
    if (passRate && Number(passRate[1]) < 50) return ok(4, `${basisHead}·考试通过率低于50%，按中级`);
    if (has(text, "高级", "三级")) return ok(6, `${basisHead}·职业资格高级（三级）`);
    if (has(text, "中级", "二级")) return ok(4, `${basisHead}·职业资格中级（二级）`);
    if (has(text, "初级", "一级")) return ok(2, `${basisHead}·职业资格初级（一级）`);
    if (has(text, "无等级") || (has(proj, "行业认证", "职业资格") && missingRank(input.level))) return ok(4, `${basisHead}·无等级职业资格按中级`);
    if (cert) return { credit: null, matched: true, catalogName: cert.name, basis: `${basisHead}：证书等级及是否全国统一待核对` };
    return fail;
  }

  return fail;
}

function prizeOf(s: string): 1 | 2 | 3 | null {
  return normalizePrize(s);
}


function ok(credit: number, basis: string): StandardLookup {
  return { credit, basis, matched: true };
}

/** 自报学分 vs 标准 → 合规标记 */
export function checkCreditCompliance(claimed: number | null, std: StandardLookup): CreditCompliance {
  if (claimed == null) return "unknown";
  if (!std.matched) return "unknown";
  if (std.credit != null) {
    if (claimed === std.credit) return "ok";
    return claimed > std.credit ? "over" : "under";
  }
  if (std.min != null && claimed < std.min) return "under";
  if (std.max != null && claimed > std.max) return "over";
  return "unknown";
}

/** 创新实践学分成绩等级（《认定办法》第十二条五级制） */
export function gradeOf(totalCredit: number): { label: string; pass: boolean } {
  if (totalCredit >= 7) return { label: "优秀", pass: true };
  if (totalCredit >= 6) return { label: "良好", pass: true };
  if (totalCredit >= 5) return { label: "中等", pass: true };
  if (totalCredit >= 4) return { label: "及格", pass: true };
  return { label: "不及格", pass: false };
}

export const COMPLIANCE_LABEL: Record<CreditCompliance, string> = {
  ok: "符合标准",
  over: "高于标准",
  under: "低于标准",
  unknown: "待核对",
};
