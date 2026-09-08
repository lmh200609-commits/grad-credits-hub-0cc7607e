import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import TablePagination from "@/components/TablePagination";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { ExternalLink, ChevronUp, ChevronDown, FileDown, ImageIcon } from "lucide-react";
import { toPlainText } from "@/lib/sanitizeMarkdown";

type Row = {
  id: string;
  description: string;
  status: any;
  selected_keywords: string[];
  custom_keywords: string[];
  ai_suggested_credit: number | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  ai_reasoning_short: string | null;
  final_credit: number | null;
  final_review_note: string | null;
  file_path: string | null;
  submitted_at: string;
  student_id: string;
};

type ProfileLite = { user_id: string; full_name: string | null; student_no: string | null; email: string | null };

type ReviewLite = {
  id: string; action: string; decision: string; credit: number | null;
  confidence: number | null; note: string | null; created_at: string;
};

const PAGE_SIZE = 50;

const SubmissionRecords = () => {
  const navigate = useNavigate();
  const { collegeId, isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [reviewCounts, setReviewCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  // Sheet state
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [detailReviews, setDetailReviews] = useState<ReviewLite[]>([]);
  const [detailFileUrl, setDetailFileUrl] = useState<string | null>(null);
  const [matchedRuleName, setMatchedRuleName] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(0); }, [debounced]);

  const load = useCallback(async () => {
    setLoading(true);
    let studentIds: string[] | null = null;
    if (debounced) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id")
        .or(`full_name.ilike.%${debounced}%,student_no.ilike.%${debounced}%`)
        .limit(500);
      studentIds = (profs ?? []).map((p) => p.user_id as string);
      if (studentIds.length === 0) {
        setRows([]); setTotal(0); setProfiles(new Map()); setLoading(false); return;
      }
    }
    let q = supabase
      .from("applications")
      .select(
        "id, description, status, selected_keywords, custom_keywords, ai_suggested_credit, ai_confidence, ai_reasoning, ai_reasoning_short, final_credit, final_review_note, file_path, submitted_at, student_id",
        { count: "exact" },
      )
      .order("submitted_at", { ascending: false });
    if (studentIds) q = q.in("student_id", studentIds);
    const from = page * PAGE_SIZE;
    const { data, count } = await q.range(from, from + PAGE_SIZE - 1);
    const list = (data as Row[]) ?? [];
    setRows(list);
    setTotal(count ?? 0);

    const ids = Array.from(new Set(list.map((r) => r.student_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, student_no, email")
        .in("user_id", ids);
      const m = new Map<string, ProfileLite>();
      (profs ?? []).forEach((p) => m.set(p.user_id, p as ProfileLite));
      setProfiles(m);
    } else {
      setProfiles(new Map());
    }

    const appIds = list.map((r) => r.id);
    if (appIds.length) {
      const { data: rvs } = await supabase
        .from("application_reviews")
        .select("application_id, action")
        .in("application_id", appIds)
        .in("action", ["teacher_review", "admin_review"]);
      const cm = new Map<string, number>();
      (rvs ?? []).forEach((r: any) => {
        cm.set(r.application_id, (cm.get(r.application_id) ?? 0) + 1);
      });
      setReviewCounts(cm);
    } else {
      setReviewCounts(new Map());
    }
    setLoading(false);
  }, [debounced, page]);

  const reload = useSerializedReload(load);
  useEffect(() => { reload(); }, [reload, load]);
  const collegeFilter = isSuperAdmin ? undefined : (collegeId ? `college_id=eq.${collegeId}` : null);
  useRealtimeTable("applications", reload, { filter: collegeFilter });

  const current = openIdx != null ? rows[openIdx] : null;

  // Load detail reviews / signed url / matched rule when openIdx changes
  useEffect(() => {
    if (!current) {
      setDetailReviews([]); setDetailFileUrl(null); setMatchedRuleName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: rvs }, signed] = await Promise.all([
        supabase.from("application_reviews").select("id, action, decision, credit, confidence, note, created_at")
          .eq("application_id", current.id).order("created_at"),
        current.file_path
          ? supabase.storage.from("application-files").createSignedUrl(current.file_path, 3600)
          : Promise.resolve({ data: null } as any),
      ]);
      if (cancelled) return;
      setDetailReviews((rvs as ReviewLite[]) ?? []);
      setDetailFileUrl(signed?.data?.signedUrl ?? null);
      // matched rule from latest ai review
      const ai = (rvs as ReviewLite[] | null)?.find((r) => r.action === "ai_evaluation");
      // We don't have matched_rule_id here; keep simple: skip rule name lookup to save round-trip.
      setMatchedRuleName(ai ? null : null);
    })();
    return () => { cancelled = true; };
  }, [current?.id]);

  // Keyboard navigation in the Sheet
  useEffect(() => {
    if (openIdx == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" && openIdx < rows.length - 1) {
        e.preventDefault(); setOpenIdx(openIdx + 1);
      } else if (e.key === "ArrowUp" && openIdx > 0) {
        e.preventDefault(); setOpenIdx(openIdx - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIdx, rows.length]);

  const renderKeywords = (r: Row) => {
    const all = [...(r.selected_keywords ?? []), ...(r.custom_keywords ?? [])].filter(Boolean);
    if (all.length === 0) return <span className="text-muted-foreground">—</span>;
    const head = all.slice(0, 4);
    const rest = all.length - head.length;
    return (
      <div className="flex flex-wrap gap-1">
        {head.map((k, i) => <Badge key={`${k}-${i}`} variant="secondary" className="text-xs">{k}</Badge>)}
        {rest > 0 && <Badge variant="outline" className="text-xs">+{rest}</Badge>}
      </div>
    );
  };

  const studentLabel = (sid: string) => {
    const p = profiles.get(sid);
    return p ? `${p.full_name ?? "—"} · ${p.student_no ?? ""}` : "—";
  };

  const manualReviewBadge = useMemo(() => {
    if (!current) return null;
    const prev = reviewCounts.get(current.id) ?? 0;
    if (current.status === "pending_review" && prev >= 1) {
      return <Badge variant="destructive">⚠ 第 {prev + 1} 次复核</Badge>;
    }
    return null;
  }, [current, reviewCounts]);

  const displayFinal = (s: any, c: number | null) =>
    s === "rejected" || s === "rejected_by_ai" ? 0 : c;

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="提交记录"
          description="按时间浏览全部学生申请，点击行可快捷查看详情"
          actions={
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索学生姓名/学号"
              className="w-56"
            />
          }
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">共 {total} 条提交</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">学生</TableHead>
                  <TableHead className="w-[140px]">状态</TableHead>
                  <TableHead>提交关键词</TableHead>
                  <TableHead className="w-[180px]">提交时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={6} cols={4} />
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={4}>
                    <EmptyState title="暂无记录" description="还没有学生提交申请" />
                  </TableCell></TableRow>
                ) : rows.map((r, idx) => {
                  const prev = reviewCounts.get(r.id) ?? 0;
                  const isReReview = r.status === "pending_review" && prev >= 1;
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => setOpenIdx(idx)}
                    >
                      <TableCell className="font-medium">{studentLabel(r.student_id)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={r.status} />
                          {isReReview && <Badge variant="destructive" className="text-xs">⚠ 第 {prev + 1} 次</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>{renderKeywords(r)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}
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

      <Sheet open={openIdx != null} onOpenChange={(o) => !o && setOpenIdx(null)}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
          {current && (() => {
            const p = profiles.get(current.student_id);
            const allKw = [...(current.selected_keywords ?? []), ...(current.custom_keywords ?? [])].filter(Boolean);
            const shortReason = current.ai_reasoning_short?.trim()
              || (current.ai_reasoning ? current.ai_reasoning.slice(0, 80) + (current.ai_reasoning.length > 80 ? "…" : "") : "");
            return (
              <>
                <SheetHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle>{p?.full_name ?? "—"}</SheetTitle>
                    <span className="text-sm text-muted-foreground">{p?.student_no} · {p?.email}</span>
                    <StatusBadge status={current.status} />
                    {manualReviewBadge}
                  </div>
                  <SheetDescription>
                    提交时间：{new Date(current.submitted_at).toLocaleString("zh-CN", { hour12: false })} · 第 {(openIdx ?? 0) + 1} / {rows.length} 条（↑↓ 切换）
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-4 space-y-4">
                  <Card>
                    <CardHeader><CardTitle className="text-sm">申请说明</CardTitle></CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-sm">{current.description}</p>
                    </CardContent>
                  </Card>

                  {allKw.length > 0 && (
                    <Card>
                      <CardHeader><CardTitle className="text-sm">关键词</CardTitle></CardHeader>
                      <CardContent className="space-y-2">
                        {current.selected_keywords?.length > 0 && (
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">学生选择</div>
                            <div className="flex flex-wrap gap-1">
                              {current.selected_keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
                            </div>
                          </div>
                        )}
                        {current.custom_keywords?.length > 0 && (
                          <div>
                            <div className="mb-1 text-xs text-muted-foreground">学生自定义</div>
                            <div className="flex flex-wrap gap-1">
                              {current.custom_keywords.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {current.file_path && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-1">
                          <ImageIcon className="h-3.5 w-3.5" /> 提交材料
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {detailFileUrl ? (
                          /\.(jpe?g|png|webp|gif)$/i.test(current.file_path) ? (
                            <a href={detailFileUrl} target="_blank" rel="noreferrer">
                              <img src={detailFileUrl} alt="提交材料"
                                className="max-h-72 w-auto rounded border bg-muted/30 object-contain" />
                            </a>
                          ) : (
                            <Button variant="outline" size="sm" asChild>
                              <a href={detailFileUrl} target="_blank" rel="noreferrer">
                                <FileDown className="mr-1 h-4 w-4" /> 查看附件
                              </a>
                            </Button>
                          )
                        ) : <p className="text-xs text-muted-foreground">附件加载中…</p>}
                      </CardContent>
                    </Card>
                  )}

                  {(current.ai_reasoning || current.ai_suggested_credit != null) && (
                    <Card className={current.status === "rejected_by_ai" ? "border-destructive" : ""}>
                      <CardHeader>
                        <CardTitle className="text-sm">系统核验结果</CardTitle>
                        <CardDescription>
                          建议学分：{current.ai_suggested_credit ?? "—"} · 置信度 {current.ai_confidence != null ? `${(Number(current.ai_confidence) * 100).toFixed(0)}%` : "—"} · 简要：{shortReason || "—"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="mb-1 text-xs font-medium text-muted-foreground">详细理由</div>
                        <p className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-xs leading-relaxed">
                          {current.ai_reasoning ? toPlainText(current.ai_reasoning) : "系统未给出详细理由。"}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">最终结果</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      <div>最终学分：<span className="font-medium">{displayFinal(current.status, current.final_credit) ?? "—"}</span></div>
                      {current.final_review_note && (
                        <div className="text-muted-foreground">复核备注：{current.final_review_note}</div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="text-sm">审核记录</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {detailReviews.length === 0 ? (
                        <p className="text-xs text-muted-foreground">暂无审核记录</p>
                      ) : detailReviews.map((r) => (
                        <div key={r.id} className="rounded border p-2 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {r.action === "ai_evaluation" ? "系统核验"
                                : r.action === "teacher_review" ? "教师复核"
                                : r.action === "admin_review" ? "管理员复核" : r.action}
                            </Badge>
                            <StatusBadge status={r.decision as any} />
                            {r.credit != null && <span className="text-muted-foreground">学分 {r.credit}</span>}
                            <span className="ml-auto text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-CN", { hour12: false })}</span>
                          </div>
                          {r.note && <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.note}</p>}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Separator />
                </div>

                <SheetFooter className="sticky bottom-0 mt-4 -mx-6 border-t bg-background px-6 py-3">
                  <div className="flex w-full items-center justify-between gap-2">
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm"
                        disabled={openIdx === 0}
                        onClick={() => openIdx != null && setOpenIdx(openIdx - 1)}>
                        <ChevronUp className="h-4 w-4" /> 上一条
                      </Button>
                      <Button variant="outline" size="sm"
                        disabled={openIdx == null || openIdx >= rows.length - 1}
                        onClick={() => openIdx != null && setOpenIdx(openIdx + 1)}>
                        <ChevronDown className="h-4 w-4" /> 下一条
                      </Button>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setOpenIdx(null)}>关闭</Button>
                      <Button size="sm" onClick={() => navigate(`/applications/${current.id}`)}>
                        <ExternalLink className="mr-1 h-4 w-4" /> 打开完整页面
                      </Button>
                    </div>
                  </div>
                </SheetFooter>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
};

export default SubmissionRecords;