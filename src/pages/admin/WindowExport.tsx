import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, RotateCcw, X } from "lucide-react";
import { toastError } from "@/lib/errors";
import { deserializeItems } from "@/lib/parseForm";
import { runZipExport, checkStorageReachable, ExportAborted, type ExportTask, type ExportProgress } from "@/lib/zipExport";

const BUCKET = "application-files";

const STATUS_LABEL: Record<string, string> = {
  pending_ai: "系统核验中",
  auto_approved: "系统初审通过",
  pending_review: "待人工复核",
  rejected_by_ai: "系统初审未通过",
  approved: "已通过",
  rejected: "已驳回",
};

type Row = {
  id: string;
  status: string;
  description: string;
  final_credit: number | null;
  claimed_credit: number | null;
  form_file_path: string | null;
  submitted_at: string;
  student_id: string;
  student_no: string;
  full_name: string;
  class_name: string;
  attachments: { file_path: string; file_name: string | null; sort_order: number; cert_name: string | null }[];
};

const safe = (s: string) => (s || "").replace(/[/\\:*?"<>|\r\n]+/g, "_").trim() || "未命名";

const titleOf = (description: string) => {
  const items = deserializeItems(description);
  const t = items.map((it) => it.achievement).filter(Boolean).slice(0, 2).join(" · ");
  if (t) return t;
  return description?.trim() ? description.trim().slice(0, 40) : "未命名申请";
};

const extOf = (path: string) => {
  const m = /\.([a-zA-Z0-9]{1,6})$/.exec(path);
  return m ? `.${m[1].toLowerCase()}` : "";
};

const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  return `${m} 分 ${s % 60} 秒`;
};


export default function WindowExport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [win, setWin] = useState<{ id: string; name: string; starts_at: string; ends_at: string; college_id: string } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress>({ volume: 1, done: 0, total: 0, elapsedMs: 0, etaMs: null });
  const [failed, setFailed] = useState<ExportTask[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!exporting) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [exporting]);



  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: w, error: we } = await supabase
        .from("submission_windows")
        .select("id,name,starts_at,ends_at,college_id")
        .eq("id", id)
        .maybeSingle();
      if (we) throw we;
      if (!w) {
        toast.error("批次不存在");
        return;
      }
      setWin(w);

      const { data: apps, error: ae } = await supabase
        .from("applications")
        .select("id,status,description,final_credit,claimed_credit,form_file_path,submitted_at,student_id")
        .eq("college_id", w.college_id)
        .gte("submitted_at", w.starts_at)
        .lte("submitted_at", w.ends_at)
        .order("submitted_at", { ascending: true })
        .limit(2000);
      if (ae) throw ae;
      const list = apps ?? [];
      if (list.length === 0) {
        setRows([]);
        return;
      }

      const studentIds = Array.from(new Set(list.map((a) => a.student_id)));
      const appIds = list.map((a) => a.id);

      const [{ data: profiles }, { data: atts }] = await Promise.all([
        supabase.from("profiles").select("user_id,full_name,student_no,class_name").in("user_id", studentIds),
        supabase
          .from("application_attachments")
          .select("application_id,file_path,file_name,sort_order,cert_name")
          .in("application_id", appIds)
          .order("sort_order", { ascending: true }),
      ]);

      const pMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const aMap = new Map<string, Row["attachments"]>();
      for (const a of atts ?? []) {
        const arr = aMap.get(a.application_id) ?? [];
        arr.push({ file_path: a.file_path, file_name: a.file_name, sort_order: a.sort_order ?? 0, cert_name: (a as { cert_name?: string | null }).cert_name ?? null });
        aMap.set(a.application_id, arr);
      }

      const merged: Row[] = list.map((a) => {
        const p = pMap.get(a.student_id);
        return {
          ...a,
          student_no: p?.student_no ?? "",
          full_name: p?.full_name ?? "未知学生",
          class_name: p?.class_name ?? "",
          attachments: aMap.get(a.id) ?? [],
        };
      });
      setRows(merged);
      setSelected(new Set(merged.map((r) => r.id)));
    } catch (e) {
      toastError(e, "加载失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const classes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.class_name || "未分班"))).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [rows],
  );

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (classFilter !== "all" && (r.class_name || "未分班") !== classFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (kw && !`${r.student_no} ${r.full_name} ${titleOf(r.description)}`.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [rows, classFilter, statusFilter, search]);

  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) filtered.forEach((r) => next.delete(r.id));
    else filtered.forEach((r) => next.add(r.id));
    setSelected(next);
  };

  const toggleOne = (rid: string) => {
    const next = new Set(selected);
    if (next.has(rid)) next.delete(rid);
    else next.add(rid);
    setSelected(next);
  };

  const buildTasks = (targets: Row[]): ExportTask[] => {
    const tasks: ExportTask[] = [];
    const usedNames = new Map<string, number>();
    const perStudentSeq = new Map<string, number>();

    for (const r of targets) {
      const cls = safe(r.class_name || "未分班");
      const person = safe(`${r.student_no || "无学号"}-${r.full_name}`);
      const folder = `${cls}/${person}`;
      const seq = (perStudentSeq.get(folder) ?? 0) + 1;
      perStudentSeq.set(folder, seq);
      const suffix = seq > 1 ? `(${seq})` : "";

      if (r.form_file_path) {
        tasks.push({
          folder,
          group: folder,
          name: `${safe(r.student_no || "无学号")}-创新实践学分认定申请表${suffix}${extOf(r.form_file_path) || ".xlsx"}`,
          path: r.form_file_path,
          who: `${r.full_name} 的申请表`,
        });
      }
      r.attachments.forEach((a, i) => {
        const key = `${folder}/佐证`;
        const n = (usedNames.get(key) ?? 0) + 1;
        usedNames.set(key, n);
        let name = `佐证材料${n}${extOf(a.file_name || a.file_path)}`;
        if (a.cert_name && a.file_name) {
          const base = safe(a.file_name);
          const cnt = (usedNames.get(`${folder}/${base}`) ?? 0) + 1;
          usedNames.set(`${folder}/${base}`, cnt);
          name = cnt > 1 ? base.replace(/\.pdf$/i, `(${cnt}).pdf`) : base;
        }
        tasks.push({
          folder,
          group: folder,
          name,
          path: a.file_path,
          who: `${r.full_name} 的佐证材料${i + 1}`,
        });
      });
    }
    return tasks;
  };

  const runTasks = async (tasks: ExportTask[]) => {
    if (!win) return;
    if (tasks.length === 0) return toast.error("所选申请没有可导出的文件");

    const ok = await checkStorageReachable(BUCKET, tasks[0].path);
    if (!ok) {
      toast.error("文件服务在当前网络下不可访问，请检查校内地址配置后重试");
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;
    setExporting(true);
    setFailed([]);
    setProgress({ volume: 1, done: 0, total: tasks.length, elapsedMs: 0, etaMs: null });

    try {
      const res = await runZipExport({
        bucket: BUCKET,
        rootName: safe(win.name),
        tasks,
        signal: ac.signal,
        onProgress: setProgress,
      });
      setFailed(res.failures);
      if (res.failures.length > 0) {
        toast.warning(`导出完成，${res.failures.length} 个文件未能下载，可点击「只重试失败项」`);
      } else {
        toast.success(`导出完成，共 ${res.exported} 个文件${res.volumes > 1 ? `，分 ${res.volumes} 卷` : ""}`);
      }
    } catch (e) {
      if (e instanceof ExportAborted) toast.info("已停止导出");
      else toastError(e, "导出失败");
    } finally {
      abortRef.current = null;
      setExporting(false);
    }
  };

  const doExport = async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    if (targets.length === 0) return toast.error("请先勾选要导出的学生");
    const tasks = buildTasks(targets);
    if (tasks.length > 400) toast.info("材料较多，导出会自动分卷，请保持页面打开");
    await runTasks(tasks);
  };

  const retryFailed = () => void runTasks(failed);

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="导出学生材料"
          description={win ? `批次：${win.name}（${new Date(win.starts_at).toLocaleString("zh-CN", { hour12: false })} — ${new Date(win.ends_at).toLocaleString("zh-CN", { hour12: false })}）` : "加载中…"}
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => navigate("/admin/submission-windows")}>
                <ArrowLeft className="mr-1 h-4 w-4" />返回
              </Button>
              {exporting ? (
                <Button variant="outline" onClick={() => abortRef.current?.abort()}>
                  <X className="mr-1 h-4 w-4" />停止导出
                </Button>
              ) : null}
              {!exporting && failed.length > 0 ? (
                <Button variant="outline" onClick={retryFailed}>
                  <RotateCcw className="mr-1 h-4 w-4" />只重试失败项（{failed.length}）
                </Button>
              ) : null}
              <Button variant="solid" onClick={doExport} disabled={exporting || selected.size === 0}>
                {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                {exporting ? "打包中…" : `导出所选（${selected.size}）`}
              </Button>
            </div>
          }
        />

        {exporting && (
          <Card>
            <CardContent className="space-y-2 py-4">
              <div className="text-sm text-muted-foreground">
                第 {progress.volume} 卷 · 已打包 {progress.done} / {progress.total} 个文件 · 已用时 {fmtDuration(progress.elapsedMs)}
                {progress.etaMs !== null ? ` · 预计还需 ${fmtDuration(progress.etaMs)}` : ""}，请勿关闭页面
              </div>
              <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            </CardContent>
          </Card>
        )}

        {!exporting && failed.length > 0 && (
          <Card>
            <CardContent className="space-y-1 py-4 text-sm">
              <div className="font-medium text-destructive">以下 {failed.length} 个文件未能下载</div>
              <ul className="list-disc pl-5 text-muted-foreground">
                {failed.slice(0, 10).map((f) => (
                  <li key={`${f.folder}/${f.name}`}>{f.who}</li>
                ))}
                {failed.length > 10 ? <li>等共 {failed.length} 个</li> : null}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>本批次申请（{filtered.length} 条）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索学号 / 姓名 / 项目"
                className="w-[240px]"
              />
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="全部班级" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部班级</SelectItem>
                  {classes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="全部状态" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="ghost" onClick={toggleAll} disabled={filtered.length === 0}>
                {allChecked ? "取消全选" : "全选当前筛选"}
              </Button>
            </div>

            {loading ? (
              <div className="py-10 text-center text-muted-foreground">加载中…</div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">该批次内暂无申请</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>学号</TableHead>
                    <TableHead>姓名</TableHead>
                    <TableHead>班级</TableHead>
                    <TableHead>项目</TableHead>
                    <TableHead>学分</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>文件</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label="选择" />
                      </TableCell>
                      <TableCell className="text-sm">{r.student_no || "—"}</TableCell>
                      <TableCell className="text-sm font-medium">{r.full_name}</TableCell>
                      <TableCell className="text-sm">{r.class_name || "未分班"}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-sm">{titleOf(r.description)}</TableCell>
                      <TableCell className="text-sm">{r.final_credit ?? r.claimed_credit ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(r.form_file_path ? 1 : 0) + r.attachments.length} 个
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
