// 赛事名录 / 证书名录：管理员可维护的权威名单，用于第一道学分核对时识别赛事与证书。
import { supabase } from "@/integrations/supabase/client";

export type CompetitionEntry = {
  id: string;
  college_id: string | null;
  name: string;
  aliases: string[];
  category: string;
  default_level: string | null;
  default_credit: number | null;
  note: string | null;
  active: boolean;
};

export type CertificateEntry = {
  id: string;
  college_id: string | null;
  name: string;
  aliases: string[];
  cert_class: string;
  level: string | null;
  issuer: string | null;
  default_credit: number | null;
  note: string | null;
  active: boolean;
};

export type Catalogs = {
  competitions: CompetitionEntry[];
  certificates: CertificateEntry[];
};

export const EMPTY_CATALOGS: Catalogs = { competitions: [], certificates: [] };

export const CERT_CLASSES = [
  "职业资格证书",
  "从业资格证书",
  "专业从业培训证书",
  "其他",
] as const;

export const COMPETITION_CATEGORIES = ["学科竞赛", "创新创业", "教学科研", "职业技能", "其他"] as const;

export const LEVEL_TIERS = [
  "国家级A类",
  "国家级B类",
  "国家级C类",
  "省部级A类",
  "省部级B类",
  "校级",
] as const;

/** 去掉届次、年份、引号、空格等噪声，便于名称比对 */
export function normalizeName(s: string): string {
  return (s || "")
    .replace(/[""“”'‘’（）()《》〈〉\s·、,，.。\-—_]/g, "")
    .replace(/第[一二三四五六七八九十百零\d]+届/g, "")
    .replace(/(19|20)\d{2}年?/g, "")
    .toLowerCase();
}

function matchIn<T extends { name: string; aliases: string[]; active: boolean }>(
  list: T[],
  text: string,
): T | null {
  const t = normalizeName(text);
  if (!t) return null;
  let best: T | null = null;
  let bestLen = 0;
  for (const e of list) {
    if (!e.active) continue;
    for (const cand of [e.name, ...(e.aliases ?? [])]) {
      const c = normalizeName(cand);
      if (!c || c.length < 2) continue;
      if (t.includes(c) || c.includes(t)) {
        if (c.length > bestLen) { best = e; bestLen = c.length; }
      }
    }
  }
  return best;
}

export function matchCompetition(catalogs: Catalogs, text: string): CompetitionEntry | null {
  return matchIn(catalogs.competitions, text);
}

export function matchCertificate(catalogs: Catalogs, text: string): CertificateEntry | null {
  return matchIn(catalogs.certificates, text);
}

/** 读取当前学院（含通用模板）的两张名录 */
export async function loadCatalogs(collegeId?: string | null): Promise<Catalogs> {
  const [comp, cert] = await Promise.all([
    supabase.from("competition_catalog").select("*").eq("active", true),
    supabase.from("certificate_catalog").select("*").eq("active", true),
  ]);
  const competitions = (comp.data ?? []) as unknown as CompetitionEntry[];
  const certificates = (cert.data ?? []) as unknown as CertificateEntry[];
  // 学院自有条目优先；无学院条目时回落到通用模板（college_id 为空）
  const pick = <T extends { college_id: string | null; name: string }>(rows: T[]): T[] => {
    if (collegeId) {
      const own = rows.filter((r) => r.college_id === collegeId);
      if (own.length) return own;
    }
    const globals = rows.filter((r) => r.college_id == null);
    if (globals.length) return globals;
    // 去重：同名只保留一条
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
  };
  return { competitions: pick(competitions), certificates: pick(certificates) };
}
