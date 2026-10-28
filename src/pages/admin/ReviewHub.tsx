import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { ReviewSourceBadge, ConfidenceBadge } from "@/components/AiVerdictCard";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import TablePagination from "@/components/TablePagination";
import { toast } from "@/hooks/use-toast";
import { decideBatch } from "@/lib/applicationActions";
import { deleteApplication } from "@/lib/deleteApplication";
import { applicationDescription } from "@/lib/applicationDisplay";
import {
  CheckCircle2, XCircle, Clock, ShieldCheck, ShieldX, Sparkles, ExternalLink, Check, X, Trash2,
} from "lucide-react";

type Counts = Record<string, number>;
type Row = {
  id: string;
  description: string;
  status: string;
  ai_suggested_credit: number | null;
  claimed_credit?: number | null;
  achievement_name?: string | null;
  level_name?: string | null;

  ai_confidence: number | null;
  final_credit: number | null;
  submitted_at: string;
  student_id: string;
  review_source: string | null;
};
type ProfileLite = { user_id: string; full_name: string | null; student_no: string | null };

const STATUS_TABS = [
  { key: "pending_review", label: "待教师复核", icon: Clock, color: "text-warning" },
  { key: "auto_approved", label: "系统已通过", icon: Sparkles, color: "text-success" },
  { key: "rejected_by_ai", label: "系统未通过", icon: XCircle, color: "text-danger" },
  { key: "pending_ai", label: "系统核验中", icon: CheckCircle2, color: "text-muted-foreground" },
  { key: "approved", label: "人工已通过", icon: ShieldCheck, color: "text-success" },
  { key: "rejected", label: "人工已驳回", icon: ShieldX, color: "text-danger" },
  { key: "all", label: "全部", icon: Sparkles, color: "text-foreground" },
] as const;

const FILTERS: Record<string, string[]> = {
  all: [],
  pending_review: ["pending_review"],
  auto_approved: ["auto_approved"],
  rejected_by_ai: ["rejected_by_ai"],
  approved: ["approved"],
  rejected: ["rejected"],
  pending_ai: ["pending_ai"],
};

const REVIEWABLE_STATUSES = new Set(["pending_ai", "pending_review", "auto_approved", "rejected_by_ai", "approved", "rejected"]);

const PAGE_SIZE = 50;

const ReviewHub = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin") || hasRole("super_admin");
  const [params, setParams] = useSearchParams();

  const initialTab = params.get("status") && FILTERS[params.get("status")!] ? params.get("status")! : "pending_review";
  const [tab, setTab] = useState(initialTab);
  const [sourceFilter, setSourceFilter] = useState<"all" | "ai_uncertain" | "student_appeal">("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);

  const [counts, setCounts] = useState<Counts>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // batch dialogs
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [defaultCredit, setDefaultCredit] = useState(1);
  const [batchNote, setBatchNote] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(0); setSelected(new Set()); }, [tab, debounced, sourceFilter]);
  useEffect(() => { if (tab !== "pending_review") setSourceFilter("all"); }, [tab]);
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set("status", tab);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadCounts = useCallback(async () => {
    const keys = ["pending_ai", "auto_approved", "pending_review", "rejected_by_ai", "approved", "rejected"] as const;
    const res = await Promise.all(keys.map((s) =>
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", s),
    ));
    const c: Counts = {};
    keys.forEach((k, i) => { c[k] = res[i].count ?? 0; });
    setCounts(c);
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    let studentIds: string[] | null = null;
    if (debounced) {
      const { data: ps } = await supabase
        .from("profiles").select("user_id")
        .or(`full_name.ilike.%${debounced}%,student_no.ilike.%${debounced}%`)
        .limit(500);
      studentIds = (ps ?? []).map((p) => p.user_id as string);
      if (!studentIds.length) {
        setRows([]); setTotal(0); setProfiles(new Map()); setLoading(false); return;
      }
    }
    let q = supabase
      .from("applications")
      .select("id, description, status, ai_suggested_credit, ai_confidence, final_credit, claimed_credit, achievement_name, level_name, submitted_at, student_id, review_source", { count: "exact" })
      .order("submitted_at", { ascending: false });
    if (FILTERS[tab].length) q = q.in("status", FILTERS[tab] as never);
    if (sourceFilter !== "all" && tab === "pending_review") q = q.eq("review_source", sourceFilter);
    if (studentIds) q = q.in("student_id", studentIds);
    const from = page * PAGE_SIZE;
    const { data, count } = await q.range(from, from + PAGE_SIZE - 1);
    const list = (data ?? []) as Row[];
    setRows(list);
    setTotal(count ?? 0);
    const ids = Array.from(new Set(list.map((r) => r.student_id)));
    if (ids.length) {
      const { data: ps } = await supabase
        .from("profiles").select("user_id, full_name, student_no").in("user_id", ids);
      const m = new Map<string, ProfileLite>();
      (ps ?? []).forEach((p) => m.set(p.user_id, p));
      setProfiles(m);
    } else setProfiles(new Map());
    setLoading(false);
  }, [tab, sourceFilter, page, debounced]);

  const reload = useSerializedReload(useCallback(async () => {
    await Promise.all([loadCounts(), loadList()]);
  }, [loadCounts, loadList]));
  // Re-fetch whenever the active tab / pagination / search / source filter changes.
  // `reload` itself is stable (useCallback []), so we depend on the underlying
  // inputs of loadList so switching tabs actually triggers a new fetch.
  useEffect(() => { reload(); }, [reload, tab, page, debounced, sourceFilter]);
  const { collegeId, isSuperAdmin } = useAuth();
  const collegeFilter = isSuperAdmin ? undefined : (collegeId ? `college_id=eq.${collegeId}` : null);
  useRealtimeTable("applications", reload, { filter: collegeFilter });

  const allSelectedOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelectedOnPage) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => { if (REVIEWABLE_STATUSES.has(r.status)) next.add(r.id); });
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const canBatch = isAdmin && selectedRows.length > 0;

  const runBatch = async (decision: "approved" | "rejected") => {
    if (!user) return;
    if (decision === "rejected" && !batchNote.trim()) {
      toast({ title: "请填写批量驳回原因", variant: "destructive" });
      return;
    }
    setRunning(true);
    const res = await decideBatch({
      rows: selectedRows.map((r) => ({
        id: r.id, status: r.status,
        ai_suggested_credit: r.ai_suggested_credit, final_credit: r.final_credit, claimed_credit: r.claimed_credit,
      })),
      decision,
      defaultCredit,
      note: batchNote || null,
      reviewerId: user.id,
      isAdmin,
    });
    setRunning(false);
    setApproveOpen(false); setRejectOpen(false);
    setBatchNote("");
    setSelected(new Set());
    toast({
      title: `批量${decision === "approved" ? "通过" : "驳回"}完成`,
      description: `成功 ${res.ok}，失败 ${res.fail}${res.errors.length ? `；首条错误：${res.errors[0]}` : ""}`,
      variant: res.fail > 0 ? "destructive" : "default",
    });
    reload();
  };

  const quickDecide = async (r: Row, decision: "approved" | "rejected", note: string | null = null) => {
    if (!user) return;
    const res = await decideBatch({
      rows: [{ id: r.id, status: r.status, ai_suggested_credit: r.ai_suggested_credit, final_credit: r.final_credit, claimed_credit: r.claimed_credit }],
      decision, defaultCredit: 1, note, reviewerId: user.id, isAdmin,
    });
    if (res.ok) toast({ title: decision === "approved" ? "已通过" : "已驳回" });
    else toast({ title: "操作失败", description: res.errors[0] ?? "请刷新页面后再试", variant: "destructive" });
    reload();
  };

  const [quickRejectRow, setQuickRejectRow] = useState<Row | null>(null);
  const [quickNote, setQuickNote] = useState("");
  const confirmQuickReject = async () => {
    if (!quickRejectRow || !quickNote.trim()) return;
    setRunning(true);
    await quickDecide(quickRejectRow, "rejected", quickNote.trim());
    setRunning(false);
    setQuickRejectRow(null);
    setQuickNote("");
  };

  const [deleteRow, setDeleteRow] = useState<Row | null>(null);
  const confirmDelete = async () => {
    if (!deleteRow) return;
    setRunning(true);
    const res = await deleteApplication(deleteRow.id);
    setRunning(false);
    setDeleteRow(null);
    if (res.ok) toast({ title: "已彻底删除" });
    else toast({ title: "删除失败", description: "error" in res ? res.error : "请刷新页面后再试", variant: "destructive" });
    reload();
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="复核中心"
          description="按状态筛选并批量处理学分申请"
          actions={
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索学生姓名/学号"
                className="w-56"
              />
              <Button variant="outline" size="sm" asChild>
                <Link to="/reviews"><ExternalLink className="mr-1 h-4 w-4" /> 全部审核</Link>
              </Button>
            </div>
          }
        />

        {/* 状态摘要条 */}
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_TABS.filter((s) => s.key !== "all").map((s) => {
            const Icon = s.icon;
            const active = tab === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setTab(s.key)}
                className={`flex items-center justify-between rounded-md border bg-card px-3 py-2 text-left text-sm transition hover:border-primary ${active ? "border-primary ring-1 ring-primary" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${s.color}`} />
                  <span>{s.label}</span>
                </span>
                <span className="font-bold tabular-nums">{counts[s.key] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            {STATUS_TABS.map((s) => <TabsTrigger key={s.key} value={s.key}>{s.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {tab === "pending_review" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">复核来源：</span>
            {([["all", "全部"], ["ai_uncertain", "AI 转人工"], ["student_appeal", "学生申诉"]] as const).map(([k, label]) => (
              <Button key={k} size="sm" variant={sourceFilter === k ? "default" : "outline"} onClick={() => setSourceFilter(k)}>
                {label}
              </Button>
            ))}
          </div>
        )}

        {/* 批量操作条 */}
        {isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              已选 <span className="font-semibold text-foreground">{selectedRows.length}</span> 条
              {selectedRows.length > 0 && ` / 本页 ${rows.length} 条`}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="default" disabled={!canBatch} onClick={() => setApproveOpen(true)}>
                <Check className="mr-1 h-4 w-4" /> 批量通过
              </Button>
              <Button size="sm" variant="destructive" disabled={!canBatch} onClick={() => setRejectOpen(true)}>
                <X className="mr-1 h-4 w-4" /> 批量驳回
              </Button>
            </div>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">共 {total} 条</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelectedOnPage} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>学生</TableHead>
                <TableHead>说明</TableHead>
                <TableHead>自报/认定学分</TableHead>
                <TableHead>判定确信度</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableSkeleton rows={5} cols={8} />
                  : rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8}><EmptyState title="暂无记录" description="切换筛选标签或等待新申请" /></TableCell></TableRow>
                  ) : rows.map((r) => {
                    const p = profiles.get(r.student_id);
                    const reviewable = REVIEWABLE_STATUSES.has(r.status);
                    const rejectedDisplay = r.status === "rejected" || r.status === "rejected_by_ai";
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(r.id)}
                            disabled={!reviewable}
                            onCheckedChange={() => toggleOne(r.id)}
                          />
                        </TableCell>
                        <TableCell>{p?.full_name ?? "—"} <span className="text-xs text-muted-foreground">{p?.student_no}</span></TableCell>
                        <TableCell className="max-w-xs truncate">
                          {r.achievement_name
                            ? `${r.achievement_name}${r.level_name ? `（${r.level_name}）` : ""}`
                            : applicationDescription(r.description, true)}
                        </TableCell>
                        <TableCell>{rejectedDisplay ? 0 : (r.final_credit ?? r.claimed_credit ?? r.ai_suggested_credit ?? "—")}</TableCell>
                        <TableCell>
                          <ConfidenceBadge status={r.status} confidence={r.ai_confidence} reviewSource={r.review_source} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <StatusBadge status={r.status as any} />
                            {r.status === "pending_review" && <ReviewSourceBadge source={r.review_source} />}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {isAdmin && reviewable && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-success" onClick={() => quickDecide(r, "approved")}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-danger" title="驳回" onClick={() => { setQuickNote(""); setQuickRejectRow(r); }}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            {isAdmin && (
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-danger" title="彻底删除" onClick={() => setDeleteRow(r)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => navigate(`/applications/${r.id}`)}>查看</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
            <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
          </CardContent>
        </Card>
      </div>

      {/* 批量通过 */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量通过 {selectedRows.length} 条申请？</AlertDialogTitle>
            <AlertDialogDescription>
              将按各申请的「最终学分 / AI 建议学分」通过；若都为空则使用下方默认学分。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <Label>默认学分（仅在申请无建议学分时使用）</Label>
              <Input
                type="number"
                step="0.5"
                min={0}
                value={defaultCredit}
                onChange={(e) => setDefaultCredit(Number(e.target.value) || 0)}
                onWheel={(e) => (e.target as HTMLInputElement).blur()}
                onKeyDown={(e) => {
                  if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
                }}
              />
            </div>
            <div>
              <Label>备注（可选）</Label>
              <Textarea rows={2} value={batchNote} onChange={(e) => setBatchNote(e.target.value)} />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={running} onClick={(e) => { e.preventDefault(); void runBatch("approved"); }}>
              {running ? "处理中…" : "确认通过"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 彻底删除 */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => { if (!o) setDeleteRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>彻底删除这条申请？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除这条申请及其申请表、佐证文件和审核记录，删除后不会再出现在任何列表和导出材料中，且无法恢复。适用于重复提交或错误信息。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={running} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); void confirmDelete(); }}>
              {running ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 单条驳回 */}
      <AlertDialog open={!!quickRejectRow} onOpenChange={(o) => { if (!o) setQuickRejectRow(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>驳回这条申请？</AlertDialogTitle>
            <AlertDialogDescription>驳回后学生会看到驳回原因，可重新提交。已通过的申请也可在此改判为驳回。</AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label>驳回原因 *</Label>
            <Textarea rows={3} value={quickNote} onChange={(e) => setQuickNote(e.target.value)} placeholder="如：材料不全 / 与申请说明不符" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={running || !quickNote.trim()} onClick={(e) => { e.preventDefault(); void confirmQuickReject(); }}>
              {running ? "处理中…" : "确认驳回"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量驳回 */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>批量驳回 {selectedRows.length} 条申请？</AlertDialogTitle>
            <AlertDialogDescription>请填写驳回原因，将作为备注写入每条申请。</AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label>驳回原因 *</Label>
            <Textarea rows={3} value={batchNote} onChange={(e) => setBatchNote(e.target.value)} placeholder="如：材料不全 / 与申请说明不符" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>取消</AlertDialogCancel>
            <AlertDialogAction disabled={running || !batchNote.trim()} onClick={(e) => { e.preventDefault(); void runBatch("rejected"); }}>
              {running ? "处理中…" : "确认驳回"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default ReviewHub;
