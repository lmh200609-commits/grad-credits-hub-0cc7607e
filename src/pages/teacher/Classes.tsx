import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/TablePagination";
import { Download, Users, GraduationCap, CheckCircle2, Trophy, ArrowUpDown, X } from "lucide-react";
import * as XLSX from "xlsx";
import { gradeOf } from "@/lib/creditStandard";

const PAGE_SIZE = 30;
const PASS_THRESHOLD = 4;

type Student = {
  user_id: string;
  full_name: string | null;
  student_no: string | null;
  major: string | null;
  class_name: string | null;
  total_credit: number;
  approved_count: number;
};

type ClassRow = {
  className: string;
  major: string;
  count: number;
  total: number;
  avg: number;
  passCount: number;
  passRate: number;
  rank: number;
  students: Student[];
};

type SortKey = "rank" | "className" | "major" | "count" | "total" | "avg" | "passCount" | "passRate";

const Classes = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [asc, setAsc] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_student_credit_ranking");
      if (error) { console.error(error); return; }
      setStudents((data ?? []).map((r: any) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        student_no: r.student_no,
        major: r.major ?? null,
        class_name: r.class_name,
        total_credit: Number(r.total_credit ?? 0),
        approved_count: Number(r.approved_count ?? 0),
      })));
    })();
  }, []);

  const classRows = useMemo<ClassRow[]>(() => {
    const groups = new Map<string, Student[]>();
    for (const s of students) {
      const key = s.class_name?.trim() || "未填写班级";
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }
    const rows = Array.from(groups.entries()).map(([className, list]) => {
      const total = list.reduce((sum, s) => sum + s.total_credit, 0);
      const passCount = list.filter((s) => s.total_credit >= PASS_THRESHOLD).length;
      const majors = Array.from(new Set(list.map((s) => s.major).filter(Boolean) as string[]));
      return {
        className,
        major: majors.join(" / ") || "—",
        count: list.length,
        total: Math.round(total * 100) / 100,
        avg: list.length ? Math.round((total / list.length) * 100) / 100 : 0,
        passCount,
        passRate: list.length ? Math.round((passCount / list.length) * 1000) / 10 : 0,
        rank: 0,
        students: [...list].sort((a, b) => b.total_credit - a.total_credit),
      };
    });
    const byAvg = [...rows].sort((a, b) => b.avg - a.avg);
    let rank = 0;
    let prev = Number.POSITIVE_INFINITY;
    byAvg.forEach((r) => {
      if (r.avg < prev) { rank += 1; prev = r.avg; }
      r.rank = rank;
    });
    return rows;
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = classRows.filter((r) =>
      !q || r.className.toLowerCase().includes(q) || r.major.toLowerCase().includes(q));
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [classRows, search, sortKey, asc]);

  useEffect(() => { setPage(0); }, [search, sortKey, asc]);
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  const overall = useMemo(() => {
    const totalStudents = students.length;
    const pass = students.filter((s) => s.total_credit >= PASS_THRESHOLD).length;
    const totalCredit = students.reduce((s, r) => s + r.total_credit, 0);
    return {
      classes: classRows.length,
      students: totalStudents,
      passRate: totalStudents ? (pass / totalStudents) * 100 : 0,
      avg: totalStudents ? totalCredit / totalStudents : 0,
    };
  }, [students, classRows]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setAsc((v) => !v);
    else { setSortKey(key); setAsc(key === "rank" || key === "className" || key === "major"); }
  };

  const exportXlsx = () => {
    const header = ["排名", "班级", "专业", "人数", "已认定总学分", "人均学分", "合格人数", "合格率"];
    const summary = filtered.map((r) => [
      r.rank, r.className, r.major, r.count, r.total, r.avg, r.passCount, `${r.passRate}%`,
    ]);
    const ws1 = XLSX.utils.aoa_to_sheet([header, ...summary]);
    ws1["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 20 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];

    const detailHeader = ["班级", "专业", "姓名", "学号", "累计学分", "成绩等级", "是否合格"];
    const detail = filtered.flatMap((r) =>
      r.students.map((s) => [
        r.className, s.major ?? "", s.full_name ?? "", s.student_no ?? "",
        Number(s.total_credit.toFixed(1)), gradeOf(s.total_credit).label,
        s.total_credit >= PASS_THRESHOLD ? "合格" : "不合格",
      ]));
    const ws2 = XLSX.utils.aoa_to_sheet([detailHeader, ...detail]);
    ws2["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "班级汇总");
    XLSX.utils.book_append_sheet(wb, ws2, "学生明细");
    XLSX.writeFile(wb, `班级学分汇总_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const selectedRow = selected ? classRows.find((r) => r.className === selected) ?? null : null;

  const SortHead = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "opacity-100" : "opacity-30"}`} />
      </button>
    </TableHead>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="班级学分"
          description="按班级汇总已认定学分与合格情况"
          actions={
            <Button onClick={exportXlsx} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" /> 导出班级汇总表
            </Button>
          }
        />

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard label="班级数" value={overall.classes} icon={GraduationCap} tone="primary" />
          <StatCard label="学生总数" value={overall.students} icon={Users} tone="info" />
          <StatCard label="整体合格率" value={`${overall.passRate.toFixed(1)}%`} icon={CheckCircle2} tone="success" hint={`≥${PASS_THRESHOLD} 学分`} />
          <StatCard label="人均学分" value={overall.avg.toFixed(1)} icon={Trophy} tone="info" />
        </div>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">筛选</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Input placeholder="搜索班级 / 专业" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex items-center text-sm text-muted-foreground md:col-span-2">
              共 {filtered.length} 个班级
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead k="rank" label="排名" />
                  <SortHead k="className" label="班级" />
                  <SortHead k="major" label="专业" />
                  <SortHead k="count" label="人数" align="right" />
                  <SortHead k="total" label="已认定总学分" align="right" />
                  <SortHead k="avg" label="人均学分" align="right" />
                  <SortHead k="passCount" label="合格人数" align="right" />
                  <SortHead k="passRate" label="合格率" align="right" />
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">暂无数据</TableCell></TableRow>
                ) : paged.map((r) => (
                  <TableRow key={r.className} className={selected === r.className ? "bg-muted/50" : "hover:bg-muted/40"}>
                    <TableCell className="font-mono text-muted-foreground">#{r.rank}</TableCell>
                    <TableCell className="font-medium">{r.className}</TableCell>
                    <TableCell className="text-muted-foreground">{r.major}</TableCell>
                    <TableCell className="text-right">{r.count}</TableCell>
                    <TableCell className="text-right font-semibold">{r.total.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-semibold">{r.avg.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{r.passCount}</TableCell>
                    <TableCell className={`text-right font-medium ${r.passRate >= 60 ? "text-success" : "text-danger"}`}>
                      {r.passRate.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setSelected(r.className)}>明细</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filtered.length > PAGE_SIZE && (
              <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            )}
          </CardContent>
        </Card>

        {selectedRow && (
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">
                {selectedRow.className} · 学生明细（{selectedRow.count} 人）
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>姓名</TableHead>
                    <TableHead>学号</TableHead>
                    <TableHead>专业</TableHead>
                    <TableHead className="text-right">通过申请</TableHead>
                    <TableHead className="text-right">累计学分</TableHead>
                    <TableHead className="text-center">成绩等级</TableHead>
                    <TableHead className="text-center">是否合格</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedRow.students.map((s) => {
                    const passed = s.total_credit >= PASS_THRESHOLD;
                    return (
                      <TableRow key={s.user_id} className={passed ? "hover:bg-muted/40" : "bg-danger/5 hover:bg-danger/10"}>
                        <TableCell className="font-medium">{s.full_name ?? "—"}</TableCell>
                        <TableCell>{s.student_no ?? "—"}</TableCell>
                        <TableCell>{s.major ?? "—"}</TableCell>
                        <TableCell className="text-right">{s.approved_count}</TableCell>
                        <TableCell className={`text-right font-semibold ${passed ? "text-success" : "text-danger"}`}>
                          {s.total_credit.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">{gradeOf(s.total_credit).label}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${passed ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                            {passed ? "合格" : "不合格"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/teacher/students/${s.user_id}`}>详情</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};

export default Classes;
