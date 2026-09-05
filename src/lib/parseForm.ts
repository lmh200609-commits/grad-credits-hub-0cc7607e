// 解析《长春财经学院本科生创新实践学分认定申请表》Excel
// 结构：表头 3 行 → 四个大类区块，每个区块含"序号/认定项目/认定成果名称/认定级别/本人排名/认定学分"表头 + 若干行。
import * as XLSX from "xlsx";

export type FormItem = {
  index: number;           // 表内第几条（1 起，跨大类连续编号）
  category: string;        // 教学科研 / 创新创业 / 学科竞赛 / 职业技能
  project: string;         // 认定项目
  achievement: string;     // 认定成果名称
  level: string;           // 认定级别
  rank: string;            // 本人排名
  credit: number | null;   // 认定学分（自报）
};

export type ParseResult =
  | { ok: true; error?: null; items: FormItem[]; studentName: string | null; studentNo: string | null; totalCredit: number | null }
  | { ok: false; error: string };

const SECTION_RE = /^[一二三四五六七八九十]+[、.．]\s*(.+)$/;
const HEADER_MARKS = ["认定项目", "认定成果名称", "认定级别", "本人排名", "认定学分"];

const norm = (v: unknown): string =>
  String(v ?? "").replace(/\s+/g, " ").trim();

const isBlankRow = (cells: string[]) =>
  cells.slice(1).every((c) => c === "") ;

export async function parseApplicationForm(file: File | ArrayBuffer): Promise<ParseResult> {
  let wb: XLSX.WorkBook;
  try {
    const buf = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
    wb = XLSX.read(buf, { type: "array" });
  } catch {
    return { ok: false, error: "无法读取该文件，请确认是从系统下载的 .xlsx 模板" };
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { ok: false, error: "表格内容为空，请使用系统提供的模板填写" };

  const grid: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" })
    .map((r: unknown[]) => r.map(norm));

  // 结构校验：必须出现四大类中的至少一类 + 列头
  const flat = grid.flat().join("|");
  if (!HEADER_MARKS.every((m) => flat.includes(m))) {
    return { ok: false, error: "表格结构不符（缺少「认定项目/成果名称/级别/排名/学分」列），请使用系统模板重新填写" };
  }

  // 从表头区提取姓名/学号（如已填写）
  let studentName: string | null = null;
  let studentNo: string | null = null;
  for (const row of grid.slice(0, 4)) {
    for (const cell of row) {
      const m1 = cell.match(/姓名[:：]\s*(\S+)/); if (m1) studentName = m1[1];
      const m2 = cell.match(/学号[:：]\s*(\S+)/); if (m2) studentNo = m2[1];
    }
  }

  const items: FormItem[] = [];
  let category = "";
  let totalCredit: number | null = null;

  for (const row of grid) {
    const joined = row.join("");
    if (!joined) continue;

    // 合计行
    if (/合计总学分/.test(joined)) {
      const n = row.map((c) => c.match(/[\d.]+/)?.[0]).find(Boolean);
      if (n) totalCredit = Number(n);
      continue;
    }
    // 大类标题行：仅一个单元格有内容且匹配 序号、
    const nonEmpty = row.filter(Boolean);
    const sec = nonEmpty.length === 1 ? SECTION_RE.exec(nonEmpty[0]) : null;
    if (sec) { category = sec[1].replace(/[:：].*$/, ""); continue; }
    // 列头行
    if (row.includes("认定项目") && row.includes("认定学分")) continue;
    // 样例行：任何单元格含"样例"直接跳过
    if (row.some((c) => c.includes("样例"))) continue;
    // 尾部说明行
    if (/填写说明|审核人|学院公章|系主任|分管院长|院部审核/.test(joined)) continue;
    // 抬头信息行（学院/专业班级/姓名/学号/成绩等级）
    if (/(所在学院|专业班级|姓\s*名|学\s*号|认定成绩等级|申请表)/.test(joined)) continue;


    const [, project, achievement, level, rank, creditRaw] = row;
    if (isBlankRow(row)) continue;
    // 成果名称为"无"或全空且仅预置了项目名称 → 视为该大类无成果
    if (!achievement || achievement === "无") continue;

    const credit = creditRaw ? Number(creditRaw.replace(/[^\d.]/g, "")) : null;
    items.push({
      index: items.length + 1,
      category: category || "未分类",
      project: project || "未填写",
      achievement,
      level: level || "未填写",
      rank: rank || "未填写",
      credit: creditRaw ? (Number.isFinite(credit) ? credit : null) : null,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: "未解析到任何有效条目，请确认已在模板中填写「认定成果名称」等内容（示例行不计入）" };
  }
  return { ok: true, items, studentName, studentNo, totalCredit };
}

export function serializeItems(items: FormItem[]): string {
  return JSON.stringify({ v: 1, items });
}

export function deserializeItems(description: string | null | undefined): FormItem[] {
  if (!description) return [];
  try {
    const obj = JSON.parse(description);
    if (obj && Array.isArray(obj.items)) return obj.items as FormItem[];
  } catch { /* 旧数据：纯文本说明 */ }
  return [];
}
