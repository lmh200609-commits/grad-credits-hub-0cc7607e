// 窗口结束后的学院统计表导出（《长春财经学院本科生创新实践学分认定统计表》）
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { gradeOf } from "@/lib/creditStandard";

export type StatsRow = {
  no: number;
  college: string;
  major: string;
  className: string;
  name: string;
  studentNo: string;
  total: number;
  grade: string;
};

type Profile = {
  user_id: string;
  full_name: string | null;
  student_no: string | null;
  major: string | null;
  class_name: string | null;
  department: string | null;
};

export async function buildWindowStats(params: {
  collegeId: string;
  collegeName: string;
  startsAt: string;
  endsAt: string;
}): Promise<StatsRow[]> {
  const { data: apps, error } = await supabase
    .from("applications")
    .select("student_id, final_credit, status, submitted_at")
    .eq("college_id", params.collegeId)
    .in("status", ["approved", "auto_approved"])
    .gte("submitted_at", params.startsAt)
    .lte("submitted_at", params.endsAt);
  if (error) throw error;

  const totals = new Map<string, number>();
  for (const a of apps ?? []) {
    const c = Number(a.final_credit ?? 0);
    totals.set(a.student_id, (totals.get(a.student_id) ?? 0) + (Number.isFinite(c) ? c : 0));
  }
  const ids = [...totals.keys()];
  if (ids.length === 0) return [];

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, full_name, student_no, major, class_name, department")
    .in("user_id", ids);
  if (pErr) throw pErr;

  const pmap = new Map((profiles ?? []).map((p) => [p.user_id, p as Profile]));

  return ids
    .map((id) => {
      const p = pmap.get(id);
      const total = Math.round((totals.get(id) ?? 0) * 100) / 100;
      return {
        no: 0,
        college: params.collegeName,
        major: p?.major ?? "",
        className: p?.class_name ?? "",
        name: p?.full_name ?? "",
        studentNo: p?.student_no ?? "",
        total,
        grade: gradeOf(total).label,
      };
    })
    .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
    .map((r, i) => ({ ...r, no: i + 1 }));
}

export function exportStatsSheetXlsx(rows: StatsRow[], subtitle: string, fileName: string) {
  const title = "长春财经学院本科生创新实践学分认定统计表";
  const aoa: (string | number)[][] = [
    [title],
    [subtitle],
    ["序号", "学院", "专业", "班级", "姓名", "学号", "认定总学分", "认定成绩等级"],
    ...rows.map((r) => [r.no, r.college, r.major, r.className, r.name, r.studentNo, r.total, r.grade]),
    [],
    ["   系主任签名：                                            年    月    日"],
    [],
    ["   分管院长签名：                                          年    月    日"],
    ["   院部审核意见：                                          院长签名："],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const last = aoa.length;
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: last - 4, c: 0 }, e: { r: last - 4, c: 7 } },
    { s: { r: last - 2, c: 0 }, e: { r: last - 2, c: 7 } },
    { s: { r: last - 1, c: 0 }, e: { r: last - 1, c: 7 } },
  ];
  ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "统计表");
  XLSX.writeFile(wb, fileName);
}

export function exportWindowStatsXlsx(rows: StatsRow[], windowName: string, collegeName: string) {
  exportStatsSheetXlsx(rows, `${collegeName} · ${windowName}`, `${collegeName}-${windowName}-学分认定统计表.xlsx`);
}
