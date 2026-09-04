import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { fetchAll } from "@/lib/fetchAll";
import TablePagination from "@/components/TablePagination";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import BulkUserDialog from "@/components/BulkUserDialog";
import { toastError } from "@/lib/errors";
import { gradeOf } from "@/lib/creditStandard";

const PAGE_SIZE = 50;

type Profile = {
  user_id: string;
  full_name: string | null;
  student_no: string | null;
  department: string | null;
  major: string | null;
  class_name: string | null;
  phone: string | null;
};

const ALL = "__all__";

const Students = () => {
  const { collegeId, isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<Profile[]>([]);
  const [studentIds, setStudentIds] = useState<Set<string>>(new Set());
  const [creditMap, setCreditMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [major, setMajor] = useState<string>(ALL);
  const [klass, setKlass] = useState<string>(ALL);
  const [page, setPage] = useState(0);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetting, setResetting] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [roleRows, profileRows, creditRows] = await Promise.all([
      fetchAll<{ user_id: string }>(supabase.from("user_roles").select("user_id").eq("role", "student")),
      fetchAll<Profile>(supabase.from("profiles").select("user_id, full_name, student_no, department, major, class_name, phone")),
      fetchAll<{ student_id: string; final_credit: number | null; ai_suggested_credit: number | null }>(
        supabase.from("applications").select("student_id, final_credit, ai_suggested_credit").in("status", ["approved", "auto_approved"]),
      ),
    ]);
    const ids = new Set(roleRows.map((r) => r.user_id));
    setStudentIds(ids);
    const cm = new Map<string, number>();
    for (const a of creditRows) {
      cm.set(a.student_id, (cm.get(a.student_id) ?? 0) + Number(a.final_credit ?? a.ai_suggested_credit ?? 0));
    }
    setCreditMap(cm);
    if (ids.size === 0) {
      console.warn("[Students] user_roles returned 0 rows — falling back to all visible profiles");
      setRows(profileRows);
    } else {
      setRows(profileRows.filter((p) => ids.has(p.user_id)));
    }
    setLoading(false);
  }, []);

  const reload = useSerializedReload(load);
  useEffect(() => { reload(); }, [reload, load]);

  // Scope realtime to current user's college so we don't receive events
  // for other colleges (server-side filter, fewer broadcasts at scale).
  const collegeFilter = isSuperAdmin ? undefined : (collegeId ? `college_id=eq.${collegeId}` : null);
  useRealtimeTable("profiles", reload, { filter: collegeFilter });
  useRealtimeTable("applications", reload, { filter: collegeFilter });

  const majors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.major).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const classes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.class_name).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (major !== ALL && r.major !== major) return false;
      if (klass !== ALL && r.class_name !== klass) return false;
      if (!q) return true;
      return [r.full_name, r.student_no, r.phone, r.class_name]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
  }, [rows, search, major, klass]);

  useEffect(() => { setPage(0); }, [search, major, klass]);
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  const submitReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("reset-password", {
      body: { user_id: resetTarget.user_id },
    });
    setResetting(false);
    if (error || (data as { error?: string })?.error) {
      toastError(error, "重置失败");
      return;
    }
    const pwd = (data as { password?: string })?.password;
    toast.success(`已重置 ${resetTarget.full_name ?? "学生"} 的密码：${pwd ?? ""}`, { duration: 8000 });
    setResetTarget(null);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader title="学生管理" description="查看学生基本信息及其所有申请记录与累计学分" />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">筛选</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-[260px] flex-1"
                placeholder="搜索姓名 / 学号 / 手机号 / 班级"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button variant="outline" onClick={() => setBulkOpen(true)}>批量重置密码</Button>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
            <Select value={major} onValueChange={setMajor}>
              <SelectTrigger><SelectValue placeholder="专业" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部专业</SelectItem>
                {majors.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={klass} onValueChange={setKlass}>
              <SelectTrigger><SelectValue placeholder="班级" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>全部班级</SelectItem>
                {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center text-sm text-muted-foreground">
              共 {filtered.length} / {rows.length} 名学生
            </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>账号 / 学号</TableHead>
                  <TableHead>院系</TableHead>
                  <TableHead>专业</TableHead>
                  <TableHead>班级</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead className="text-center">累计学分 / 等级</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <>{Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 8 }).map((_, c) => (
                      <TableCell key={c}><div className="h-4 animate-pulse rounded bg-muted" /></TableCell>
                    ))}</TableRow>
                  ))}</>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">暂无符合条件的学生</TableCell></TableRow>
                ) : (
                  paged.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                      <TableCell>{r.student_no ?? "—"}</TableCell>
                      <TableCell>{r.department ?? "—"}</TableCell>
                      <TableCell>{r.major ?? "—"}</TableCell>
                      <TableCell>{r.class_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const c = creditMap.get(r.user_id) ?? 0;
                          return (
                            <span className="text-sm">
                              <span className="font-semibold">{c.toFixed(1)}</span>
                              <span className={`ml-1.5 rounded px-1.5 py-0.5 text-xs font-medium ${c >= 4 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                                {gradeOf(c)}
                              </span>
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button asChild variant="outline" size="sm">
                            <Link to={`/teacher/students/${r.user_id}`}>查看详情</Link>
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setResetTarget(r)}>
                            重置密码
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {!loading && filtered.length > PAGE_SIZE && (
              <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && !resetting && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置学生密码</AlertDialogTitle>
            <AlertDialogDescription>
              将把 <span className="font-semibold text-foreground">{resetTarget?.full_name ?? "该学生"}</span>
              （{resetTarget?.student_no ?? "—"}）的密码重置为默认密码（学号 + 手机号后 6 位，缺失则补 0）。请通过线下渠道告知学生。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); submitReset(); }} disabled={resetting}>
              {resetting ? "重置中…" : "确认重置"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BulkUserDialog
        open={bulkOpen}
        mode="reset"
        role="student"
        onClose={() => setBulkOpen(false)}
      />
    </AppLayout>
  );
};

export default Students;
