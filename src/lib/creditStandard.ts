// 《长春财经学院本科生创新实践学分认定办法（试行）》长财院〔2020〕135号 附件标准表
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
  if (has(s, "国家", "全国", "国际")) return "国家级B类";
  if (has(s, "省") || has(s, "部")) {
    if (has(s, "B类") || /省级?B/.test(s)) return "省部级B类";
    return "省部级A类";
  }
  if (has(s, "市")) return "省部级B类";
  if (has(s, "校", "院")) return "校级";
  return null;
}

/** 奖次归一：特等/一等/金奖→1，二等/银奖→2，三等/铜奖/优秀→3，其余 null */
export function normalizePrize(raw: string): 1 | 2 | 3 | null {
  const s = raw || "";
  if (has(s, "特等", "一等", "金奖", "冠军", "第一名")) return 1;
  if (has(s, "二等", "银奖", "亚军", "第二名")) return 2;
  if (has(s, "三等", "铜奖", "季军", "第三名", "优秀奖", "优胜奖")) return 3;
  return null;
}

// 排名/角色 → 档位数
function rankSlot(rank: string, slots: { key: string[]; credit: number }[]): number | null {
  for (const s of slots) {
    if (has(rank, ...s.key)) return s.credit;
  }
  return null;
}

const LEADER_KEYS = ["负责人", "主持人", "第一作者", "第一署名", "独立", "个人", "第一参与", "队长", "组长", "第一"];
const FIRST_KEYS = ["第一参与", "第二", "次位"];
const OTHER_KEYS = ["其他", "参与", "成员", "第三", "第四", "第五", "团队"];


export function lookupStandardCredit(input: LookupInput, catalogs: Catalogs = EMPTY_CATALOGS): StandardLookup {
  let cat = input.category || "";
  const proj = `${input.project} ${input.achievement}`;
  const achieve = input.achievement || "";
  const rank = input.rank || "";

  // 名录识别：赛事名录（识别标准赛事及简称）/ 证书名录
  const comp = matchCompetition(catalogs, proj);
  const cert = !comp ? matchCertificate(catalogs, proj) : null;
  if (comp && !has(cat, "教学科研")) cat = comp.category || cat;
  if (cert) cat = "职业技能";

  // 级别归一：国家级C类/国际级C类 按省部级A类降档
  const level = normalizeLevel(input.level) ?? comp?.default_level ?? input.level ?? "";
  const catalogName = comp?.name ?? cert?.name;
  const basisHead = `${cat || "未分类"}·${catalogName ?? input.project ?? "未填写"}`;

  const fail: StandardLookup = { credit: null, basis: "", matched: false, catalogName, normalizedLevel: normalizeLevel(input.level) ?? undefined };

  // 名录中的证书：按名录类别与默认学分认定
  if (cert) {
    if (cert.default_credit != null) {
      return {
        credit: cert.default_credit, matched: true, catalogName: cert.name,
        basis: `职业技能·${cert.name}（${cert.cert_class}${cert.level ? "·" + cert.level : ""}）`,
      };
    }
    return {
      credit: null, matched: true, catalogName: cert.name,
      basis: `职业技能·${cert.name}（${cert.cert_class}）：需教师核定`,
    };
  }

  // 学生自填的「其他」项目：一律交教师核定
  if (has(cat, "其他") && !comp) {
    return { credit: null, matched: true, basis: `${basisHead}：名录外项目，需教师核定` };
  }


  // ============ 一、教学科研 ============
  if (has(cat, "教学科研", "科研")) {
    // 发表论文
    if (has(proj, "论文", "发表")) {
      const first = has(rank, "第一", "一作", "通讯") || rank === "" || has(rank, "独立");
      if (has(level + achieve, "SCI", "SSCI", "CSSCI"))
        return ok(first ? 10 : 8, `${basisHead}·SCI/SSCI/CSSCI收录论文·${first ? "第一作者" : "其他作者"}`);
      if (has(level + achieve, "EI", "CPCI", "北大核心", "核心"))
        return ok(first ? 8 : 6, `${basisHead}·EI/CPCI/北大核心·${first ? "第一作者" : "其他作者"}`);
      if (has(level, "国家级", "省级") || has(proj, "普刊", "报刊"))
        return ok(first ? 6 : 4, `${basisHead}·国家级/省级普刊报刊·${first ? "第一作者" : "其他作者"}`);
      return { credit: null, min: 4, max: 10, basis: `${basisHead}·发表论文（4–10 分，视收录与作者序）`, matched: true };
    }
    // 教学科研项目
    if (has(proj, "项目", "课题", "纵向", "横向", "协同育人")) {
      const leader = has(rank, ...LEADER_KEYS) || rank === "";
      if (has(level, "国家级", "省级") || has(proj, "省级以上", "教育部"))
        return ok(leader ? 10 : 8, `${basisHead}·省级以上项目·${leader ? "主持人" : "参与人"}`);
      if (has(level, "市") || has(proj, "行业企业", "省教育厅"))
        return ok(leader ? 8 : 6, `${basisHead}·市级以上项目·${leader ? "主持人" : "参与人"}`);
      if (has(proj, "学会"))
        return ok(leader ? 4 : 2, `${basisHead}·省级以上学会项目·${leader ? "主持人" : "参与人"}`);
      return { credit: null, min: 2, max: 10, basis: `${basisHead}·科研项目（2–10 分，视级别与角色）`, matched: true };
    }
    // 科学调查研究
    if (has(proj, "调查", "调研", "研究报告", "资政")) {
      const first = has(rank, "第一", "一作") || rank === "";
      return ok(first ? 2 : 1, `${basisHead}·科学调查研究·${first ? "第一作者" : "其他作者"}`);
    }
    // 知识产权
    if (has(proj, "专利", "著作权", "知识产权", "软件著作")) {
      const first = has(rank, "第一", "第一署名") || rank === "";
      return ok(first ? 6 : 4, `${basisHead}·知识产权·${first ? "第一署名" : "其他成员"}`);
    }
    return fail;
  }

  // ============ 二、创新创业 ============
  if (has(cat, "创新创业", "创业")) {
    // 大创
    if (has(proj, "大学生创新创业训练", "大创")) {
      const c = rankSlot(rank, [
        { key: ["主持人", "负责人"], credit: 0 }, // placeholder replaced below
      ]);
      void c;
      const leader = has(rank, "主持", "负责人") || rank === "";
      const first = has(rank, "第一参与");
      const slot = (l: number, f: number, o: number) => leader ? l : first ? f : o;
      if (has(level, "国家级")) return ok(slot(6, 5, 4), `${basisHead}·大创国家级`);
      if (has(level, "省级")) return ok(slot(5, 4, 2), `${basisHead}·大创省级`);
      if (has(level, "校")) return ok(slot(2, 1, 1), `${basisHead}·大创校级`);
      return { credit: null, min: 1, max: 6, basis: `${basisHead}·大创（1–6 分，视级别与角色）`, matched: true };
    }
    // 自主创业
    if (has(proj, "自主创业", "青创空间")) {
      const leader = has(rank, "负责人", "主持") || rank === "";
      return ok(leader ? 4 : 2, `${basisHead}·自主创业·${leader ? "负责人" : "主要成员"}`);
    }
    // 互联网+ / 挑战杯
    if (has(proj, "互联网", "挑战杯")) {
      const leader = has(rank, "负责人") || rank === "";
      const first = has(rank, "第一参与");
      const slot = (l: number, f: number, o: number) => leader ? l : first ? f : o;
      const prize = prizeOf(level + achieve);
      if (has(level, "国")) {
        if (prize === 1) return ok(slot(10, 9, 8), `${basisHead}·国赛一等奖`);
        if (prize === 2) return ok(slot(8, 7, 6), `${basisHead}·国赛二等奖`);
        if (prize === 3) return ok(slot(6, 5, 4), `${basisHead}·国赛三等奖`);
      }
      if (has(level, "省")) {
        if (prize === 1) return ok(slot(8, 7, 6), `${basisHead}·省赛一等奖`);
        if (prize === 2) return ok(slot(6, 5, 4), `${basisHead}·省赛二等奖`);
        if (prize === 3) return ok(slot(5, 4, 3), `${basisHead}·省赛三等奖`);
      }
      return { credit: null, min: 3, max: 10, basis: `${basisHead}·互联网+/挑战杯（3–10 分）`, matched: true };
    }
    return fail;
  }

  // ============ 三、学科竞赛 ============
  if (has(cat, "学科竞赛", "竞赛", "文体")) {
    const prize = prizeOf(level + achieve);
    // 个人参赛按团队负责人认定（办法备注）
    const isSolo = has(rank, "个人", "独立") || rank === "";
    const leader = isSolo || has(rank, "负责人");
    const first = has(rank, "第一参与");
    const slot3 = (l: number, f: number | null, o: number | null) =>
      leader ? l : first && f != null ? f : o;
    if (has(level, "国家级")) {
      if (prize === 1) return ok(slot3(8, 7, 6) ?? 6, `${basisHead}·国家级B类一等奖`);
      if (prize === 2) return ok(slot3(7, 6, 5) ?? 5, `${basisHead}·国家级B类二等奖`);
      if (prize === 3) return ok(slot3(5, 4, null) ?? 4, `${basisHead}·国家级B类三等奖`);
    }
    if (has(level, "A类") || (has(level, "省") && has(level, "A"))) {
      if (prize === 1) return ok(slot3(6, null, 5) ?? 5, `${basisHead}·省部级A类一等奖`);
      if (prize === 2) return ok(slot3(5, null, 4) ?? 4, `${basisHead}·省部级A类二等奖`);
      if (prize === 3) return ok(slot3(4, null, 3) ?? 3, `${basisHead}·省部级A类三等奖`);
    }
    if (has(level, "B类") || (has(level, "省") && has(level, "B"))) {
      if (prize === 1) return ok(slot3(6, null, 4) ?? 4, `${basisHead}·省部级B类一等奖`);
      if (prize === 2) return ok(slot3(5, null, 4) ?? 4, `${basisHead}·省部级B类二等奖`);
      if (prize === 3) return ok(slot3(4, null, 2) ?? 2, `${basisHead}·省部级B类三等奖`);
    }
    if (has(level, "省")) { // 未分 A/B 时按 A 类参考
      if (prize === 1) return { credit: null, min: 6, max: 6, basis: `${basisHead}·省部级一等奖（A类6/B类6）`, matched: true };
      if (prize === 2) return ok(slot3(5, null, 4) ?? 4, `${basisHead}·省部级二等奖`);
      if (prize === 3) return { credit: null, min: 2, max: 4, basis: `${basisHead}·省部级三等奖（A类3-4/B类2-4）`, matched: true };
    }
    if (has(level, "校")) {
      if (prize === 1) return ok(slot3(5, null, 4) ?? 4, `${basisHead}·校级一等奖`);
      if (prize === 2) return ok(slot3(4, null, 2) ?? 2, `${basisHead}·校级二等奖`);
      if (prize === 3) return ok(slot3(2, null, 1) ?? 1, `${basisHead}·校级三等奖`);
    }
    return { credit: null, min: 1, max: 8, basis: `${basisHead}·学科竞赛（1–8 分，视级别/奖次/角色）`, matched: true };
  }

  // ============ 四、职业技能 ============
  if (has(cat, "职业技能", "技能", "证书")) {
    const text = level + achieve + proj;
    if (has(text, "六级", "CET-6", "CET6", "专八", "专业八级")) return ok(6, `${basisHead}·六级/专八`);
    if (has(text, "四级", "CET-4", "CET4", "专四", "专业四级")) return ok(4, `${basisHead}·四级/专四`);
    if (has(proj, "第二课堂", "学术报告", "学术研讨", "培训活动", "调研活动"))
      return { credit: null, basis: `${basisHead}·第二课堂：每 16 学时或 1 周记 1 学分（按证明材料学时核定）`, matched: true };
    if (has(level, "高级", "三级")) return ok(6, `${basisHead}·职业资格高级（三级）`);
    if (has(level, "中级", "二级")) return ok(4, `${basisHead}·职业资格中级（二级）`);
    if (has(level, "初级", "一级")) return ok(2, `${basisHead}·职业资格初级（一级）`);
    if (has(proj, "行业认证", "职业资格", "等级证书"))
      return { credit: null, min: 2, max: 6, basis: `${basisHead}·职业资格/等级证书（2–6 分，无等级按中级 4 分）`, matched: true };
    return fail;
  }

  return fail;
}

function prizeOf(s: string): 1 | 2 | 3 | null {
  if (has(s, "一等", "金奖", "冠军", "特等奖")) return 1;
  if (has(s, "二等", "银奖", "亚军")) return 2;
  if (has(s, "三等", "铜奖", "季军", "优秀奖")) return 3;
  return null;
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
  return "ok";
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
  unknown: "待人工核定",
};
