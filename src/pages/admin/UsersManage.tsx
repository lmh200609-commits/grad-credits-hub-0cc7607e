import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import TablePagination from "@/components/TablePagination";
import BulkUserDialog from "@/components/BulkUserDialog";
import SingleUserDialog from "@/components/SingleUserDialog";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toastError } from "@/lib/errors";

const PAGE_SIZE = 50;

type Profile = {
  user_id: string;
  full_name: string | null;
  student_no: string | null;
  department: string | null;
  major: string | null;
  class_name: string | null;
  email: string | null;
  phone: string | null;
};

const TITLES: Record<string, { title: string; desc: string }> = {
  students: { title: "学生管理", desc: "查看学生信息并重置密码" },
  teachers: { title: "教师管理", desc: "查看教师信息并重置密码" },
};

const ALL = "__all__";

const UsersManage = () => {
  const { user } = useAuth();
  const selfId = user?.id ?? null;
  const { role: roleParam } = useParams<{ role: string }>();
  const role = (roleParam ?? "").startsWith("teacher") ? "teacher" : "student";
  const meta = TITLES[role === "teacher" ? "teachers" : "students"] ?? TITLES.students;
  const [sp] = useSearchParams();
  const initialSearch = sp.get("search") ?? "";

  const [rows, setRows] = useState<Profile[]>([]);
  const [credits, setCredits] = useState<Map<string, { total: number; count: number }>>(new Map());
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<{ majors: string[]; classes: string[] }>({ majors: [], classes: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [major, setMajor] = useState(ALL);
  const [klass, setKlass] = useState(ALL);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const [bulkMode, setBulkMode] = useState<"delete" | "reset" | null>(null);
  const [singleOpen, setSingleOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // 1) 取角色用户ID（每学院通常 < 5000，可承受）
    const { data: roleRows } = await supabase.from("user_roles").select("user_id").eq("role", role);
    const roleIds = (roleRows ?? []).map((r) => r.user_id);
    if (roleIds.length === 0) {
      setRows([]); setTotal(0); setCredits(new Map()); setFacets({ majors: [], classes: [] });
      setLoading(false);
      return;
    }

    // 2) Facets：只取去重列（distinct via group），低开销
    const { data: facetRows } = await supabase
      .from("profiles")
      .select("major, class_name")
      .in("user_id", roleIds);
    const facetSetM = new Set<string>(); const facetSetC = new Set<string>();
    (facetRows ?? []).forEach((r) => {
      if (r.major) facetSetM.add(r.major);
      if (r.class_name) facetSetC.add(r.class_name);
    });
    setFacets({
      majors: Array.from(facetSetM).sort(),
      classes: Array.from(facetSetC).sort(),
    });

    // 3) 服务端筛选 + 分页
    let q = supabase
      .from("profiles")
      .select("user_id, full_name, student_no, department, major, class_name, email, phone", { count: "exact" })
      .in("user_id", roleIds);
    if (role === "student" && major !== ALL) q = q.eq("major", major);
    if (role === "student" && klass !== ALL) q = q.eq("class_name", klass);
    const s = search.trim();
    if (s) {
      const esc = s.replace(/[,()]/g, " ");
      q = q.or(
        `full_name.ilike.%${esc}%,student_no.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%,class_name.ilike.%${esc}%,department.ilike.%${esc}%,major.ilike.%${esc}%`
      );
    }
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: profileRows, count } = await q
      .order("student_no", { ascending: true, nullsFirst: false })
      .range(from, to);
    setRows((profileRows ?? []) as Profile[]);
    setTotal(count ?? 0);

    // 4) 学分仅对当前页学生
    if (role === "student" && profileRows && profileRows.length > 0) {
      const ids = profileRows.map((r) => r.user_id);
      const { data: apps } = await supabase
        .from("applications")
        .select("student_id, status, final_credit, ai_suggested_credit")
        .in("student_id", ids)
        .in("status", ["approved", "auto_approved"]);
      const m = new Map<string, { total: number; count: number }>();
      (apps ?? []).forEach((a) => {
        const c = Number(a.final_credit ?? a.ai_suggested_credit ?? 0);
        const cur = m.get(a.student_id) ?? { total: 0, count: 0 };
        m.set(a.student_id, { total: cur.total + c, count: cur.count + 1 });
      });
      setCredits(m);
    } else {
      setCredits(new Map());
    }
    setLoading(false);
  }, [role, major, klass, search, page]);

  // 搜索/筛选变化时回到第一页
  useEffect(() => { setPage(0); }, [search, role, major, klass]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSearch(sp.get("search") ?? ""); }, [sp]);

  const majors = facets.majors;
  const classes = facets.classes;
  const filtered = rows; // 服务端已筛选
  const paged = rows;

  const resetPassword = async () => {
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
    toast.success(`已为 ${resetTarget.full_name ?? resetTarget.email} 重置为默认密码：${pwd ?? ""}`, { duration: 8000 });
    setResetTarget(null);
  };

  const deleteAccount = async () => {
    if (!deleteTarget) return;
    if (selfId && deleteTarget.user_id === selfId) {
      toast.error("不能删除当前登录账号");
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { user_id: deleteTarget.user_id },
    });
    setDeleting(false);
    if (error || (data as { error?: string })?.error) {
      toastError(error, "删除失败");
      return;
    }
    toast.success(`已删除 ${deleteTarget.full_name ?? deleteTarget.student_no ?? deleteTarget.email ?? "账号"}`);
    setDeleteTarget(null);
    await load();
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader title={meta.title} description={meta.desc} />

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">筛选</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-[260px] flex-1"
                placeholder={role === "student" ? "搜索姓名 / 学号 / 手机号 / 班级 / 院系" : "搜索姓名 / 工号 / 手机号 / 院系"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button onClick={() => setSingleOpen(true)}>
                <UserPlus className="mr-1 h-4 w-4" />
                新建{role === "student" ? "学生" : "教师"}账号
              </Button>
              <Button variant="outline" onClick={() => setBulkMode("reset")}>批量重置密码</Button>
              {role === "student" && (
                <Button variant="destructive" onClick={() => setBulkMode("delete")}>批量删除账号</Button>
              )}
              {role === "teacher" && (
                <Button variant="destructive" onClick={() => setBulkMode("delete")}>批量删除账号</Button>
              )}
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {role === "student" && (
                <>
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
                </>
              )}
              <div className="flex items-center text-sm text-muted-foreground">
                共 {total} 人
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
                  <TableHead>{role === "student" ? "学号" : "工号"}</TableHead>
                  <TableHead>院系</TableHead>
                  {role === "student" && <TableHead>专业</TableHead>}
                  {role === "student" && <TableHead>班级</TableHead>}
                  <TableHead>手机号</TableHead>
                  {role === "student" && <TableHead className="text-right">累计学分</TableHead>}
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={5} cols={role === "student" ? 8 : 5} />
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={role === "student" ? 8 : 5}><EmptyState title="暂无数据" description="请先在「批量导入账号」中导入账号" /></TableCell></TableRow>
                ) : paged.map((r) => {
                  const c = credits.get(r.user_id);
                  return (
                  <TableRow key={r.user_id}>
                    <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                    <TableCell>{r.student_no ?? "—"}</TableCell>
                    <TableCell>{r.department ?? "—"}</TableCell>
                    {role === "student" && <TableCell>{r.major ?? "—"}</TableCell>}
                    {role === "student" && <TableCell>{r.class_name ?? "—"}</TableCell>}
                    <TableCell className="text-muted-foreground">{r.phone ?? "—"}</TableCell>
                    {role === "student" && (
                      <TableCell className="text-right">
                        <span className={`font-semibold ${(c?.total ?? 0) >= 4 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {(c?.total ?? 0).toFixed(1)}
                        </span>
                        <span className="ml-1 text-xs text-muted-foreground">({c?.count ?? 0})</span>
                      </TableCell>
                    )}
                    <TableCell className="space-x-2 text-right">
                      <Button variant="outline" size="sm" onClick={() => setResetTarget(r)}>
                        重置密码
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setDeleteTarget(r)}>
                        删除账号
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!loading && total > PAGE_SIZE && (
              <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && !resetting && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置密码</AlertDialogTitle>
            <AlertDialogDescription>
              将把 <span className="font-semibold text-foreground">{resetTarget?.full_name ?? resetTarget?.student_no ?? resetTarget?.email ?? "该用户"}</span> 的密码重置为默认密码（{role === "student" ? "学号" : "工号"} + 手机号后 6 位，缺失则补 0）。请通过安全渠道告知用户。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); resetPassword(); }} disabled={resetting}>
              {resetting ? "重置中…" : "确认重置"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除账号</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除 <span className="font-semibold text-foreground">{deleteTarget?.full_name ?? deleteTarget?.student_no ?? deleteTarget?.email ?? "该用户"}</span> 的账号、个人资料及角色信息，操作不可撤销。请再次点击「确认删除」继续。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deleteAccount(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {bulkMode && (
        <BulkUserDialog
          open={!!bulkMode}
          mode={bulkMode}
          role={role as "student" | "teacher"}
          onClose={() => setBulkMode(null)}
          onDone={() => load()}
        />
      )}

      <SingleUserDialog
        open={singleOpen}
        role={role as "student" | "teacher"}
        onClose={() => setSingleOpen(false)}
        onDone={() => load()}
      />
    </AppLayout>
  );
};

export default UsersManage;
