import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { Plus, FileSpreadsheet, RefreshCw, Trash2, FileText, Pencil, Download, FolderArchive } from "lucide-react";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { toastError } from "@/lib/errors";
import { buildWindowStats, exportWindowStatsXlsx } from "@/lib/windowStats";

type Window = {
  id: string;
  college_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  report_generated_at: string | null;
  report_path: string | null;
};

type College = { id: string; name: string };

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fromLocalInput = (s: string) => new Date(s).toISOString();

const statusOf = (w: Window) => {
  if (!w.active) return { label: "已停用", tone: "secondary" as const };
  const now = Date.now();
  const s = new Date(w.starts_at).getTime();
  const e = new Date(w.ends_at).getTime();
  if (now < s) return { label: "未开始", tone: "outline" as const };
  if (now > e) return { label: "已结束", tone: "destructive" as const };
  return { label: "进行中", tone: "default" as const };
};

const SubmissionWindows = () => {
  const { collegeId, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [colleges, setColleges] = useState<College[]>([]);
  const [activeCollege, setActiveCollege] = useState<string | null>(null);
  const [items, setItems] = useState<Window[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Window | null>(null);
  const [form, setForm] = useState({ name: "", starts_at: "", ends_at: "", active: true });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [collegeName, setCollegeName] = useState("");

  useEffect(() => {
    if (isSuperAdmin) {
      supabase.from("colleges").select("id, name").order("name").then(({ data }) => {
        const cs = (data ?? []) as College[];
        setColleges(cs);
        if (!activeCollege && cs[0]) setActiveCollege(cs[0].id);
      });
    } else if (collegeId) {
      setActiveCollege(collegeId);
    }
  }, [isSuperAdmin, collegeId]);

  const load = useCallback(async () => {
    if (!activeCollege) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("submission_windows")
      .select("*")
      .eq("college_id", activeCollege)
      .order("starts_at", { ascending: false });
    if (error) toastError(error);
    setItems((data ?? []) as Window[]);
    setLoading(false);
  }, [activeCollege]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!activeCollege) return;
    supabase.from("colleges").select("name").eq("id", activeCollege).maybeSingle()
      .then(({ data }) => setCollegeName(data?.name ?? ""));
  }, [activeCollege]);

  const exportStats = async (w: Window) => {
    setExportingId(w.id);
    try {
      const rows = await buildWindowStats({
        collegeId: w.college_id,
        collegeName: collegeName || "本学院",
        startsAt: w.starts_at,
        endsAt: w.ends_at,
      });
      if (rows.length === 0) return toast.error("该批次暂无已通过的申请");
      exportWindowStatsXlsx(rows, w.name, collegeName || "本学院");
      toast.success("统计表已导出");
    } catch (e: any) {
      toastError(e, "导出失败");
    } finally {
      setExportingId(null);
    }
  };

  const openCreate = () => {
    setEditing(null);
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 86400_000);
    setForm({
      name: "",
      starts_at: toLocalInput(now.toISOString()),
      ends_at: toLocalInput(end.toISOString()),
      active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (w: Window) => {
    setEditing(w);
    setForm({
      name: w.name,
      starts_at: toLocalInput(w.starts_at),
      ends_at: toLocalInput(w.ends_at),
      active: w.active,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!activeCollege) return;
    if (!form.name.trim()) return toast.error("请填写批次名称");
    if (new Date(form.ends_at) <= new Date(form.starts_at)) return toast.error("结束时间必须晚于开始时间");
    const payload = {
      college_id: activeCollege,
      name: form.name.trim(),
      starts_at: fromLocalInput(form.starts_at),
      ends_at: fromLocalInput(form.ends_at),
      active: form.active,
    };
    if (editing) {
      const { error } = await supabase.from("submission_windows").update(payload).eq("id", editing.id);
      if (error) return toastError(error);
    } else {
      const { error } = await supabase.from("submission_windows").insert(payload);
      if (error) return toastError(error);
    }
    toast.success("已保存");
    setDialogOpen(false);
    void load();
  };

  const toggleActive = async (w: Window) => {
    const { error } = await supabase.from("submission_windows").update({ active: !w.active }).eq("id", w.id);
    if (error) toastError(error);
    else void load();
  };

  const remove = async (w: Window) => {
    if (w.report_generated_at) return toast.error("已生成报告，无法删除");
    if (!confirm(`确定删除「${w.name}」?`)) return;
    const { error } = await supabase.from("submission_windows").delete().eq("id", w.id);
    if (error) toastError(error);
    else void load();
  };

  const generateReport = async (w: Window) => {
    setBusyId(w.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-window-report", {
        body: { window_id: w.id },
      });
      if (error) throw error;
      toast.success("报告已生成，正在打开…");
      const route = (data as any)?.report_route ?? `/admin/window-report/${w.id}`;
      void load();
      navigate(route);
    } catch (e: any) {
      toastError(e, "生成失败");
    } finally {
      setBusyId(null);
    }
  };

  const viewReport = (w: Window) => {
    navigate(`/admin/window-report/${w.id}`);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="提交时间窗口"
          description="设置学生可提交学分申请的批次时间，到期后自动生成可导出的报告"
          actions={
            <Button variant="solid" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新建批次</Button>
          }
        />

        {isSuperAdmin && (
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Label>切换学院</Label>
                <SearchableSelect
                  value={activeCollege ?? ""}
                  onChange={(v) => setActiveCollege(v || null)}
                  options={colleges.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="选择学院"
                  searchPlaceholder="搜索学院…"
                  className="w-[280px]"
                />
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>批次列表</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>批次</TableHead>
                  <TableHead>开始</TableHead>
                  <TableHead>结束</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead>报告</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">加载中…</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <span>暂无批次</span>
                        <Button variant="solid" onClick={openCreate}><Plus className="mr-1 h-4 w-4" />新建第一个批次</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : items.map((w) => {
                  const st = statusOf(w);
                  return (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(w.starts_at).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{new Date(w.ends_at).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                      <TableCell><Badge variant={st.tone}>{st.label}</Badge></TableCell>
                      <TableCell><Switch checked={w.active} onCheckedChange={() => toggleActive(w)} /></TableCell>
                      <TableCell className="text-sm">
                        {w.report_generated_at
                          ? <span className="text-success">已生成 {new Date(w.report_generated_at).toLocaleString("zh-CN", { hour12: false })}</span>
                          : <span className="text-muted-foreground">未生成</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(w)} aria-label="编辑批次">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>编辑批次</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" disabled={busyId === w.id}
                                onClick={() => generateReport(w)} aria-label="生成报告">
                                {busyId === w.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{busyId === w.id ? "生成中…" : "生成报告"}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost" disabled={exportingId === w.id}
                                onClick={() => exportStats(w)} aria-label="导出统计表">
                                {exportingId === w.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>导出学院统计表（Excel）</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button size="sm" variant="ghost"
                                onClick={() => navigate(`/admin/windows/${w.id}/export`)} aria-label="导出材料">
                                <FolderArchive className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>导出学生材料（按班级 / 学号-姓名 打包）</TooltipContent>
                          </Tooltip>
                          {w.report_generated_at && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => viewReport(w)} aria-label="查看报告">
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>查看报告 / 导出 PDF</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>
                                <Button size="sm" variant="ghost" onClick={() => remove(w)} disabled={!!w.report_generated_at} aria-label="删除批次">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{w.report_generated_at ? "已生成报告，无法删除" : "删除批次"}</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-card text-card-foreground border shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑批次" : "新建批次"}</DialogTitle>
            <DialogDescription>设置该批次的开放时间和启用状态。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>批次名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 2026 春季学分申报" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>开始时间</Label>
                <DateTimePicker value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} />
              </div>
              <div className="space-y-2">
                <Label>结束时间</Label>
                <DateTimePicker value={form.ends_at} onChange={(v) => setForm({ ...form, ends_at: v })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label>启用此批次</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button variant="solid" onClick={save}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default SubmissionWindows;