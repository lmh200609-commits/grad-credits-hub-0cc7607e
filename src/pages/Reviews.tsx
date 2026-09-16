import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/StatusBadge";
import { ReviewSourceBadge, ConfidenceBadge } from "@/components/AiVerdictCard";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import TablePagination from "@/components/TablePagination";

type Row = {
  id: string;
  description: string;
  status: any;
  ai_suggested_credit: number | null;
  ai_confidence: number | null;
  final_credit: number | null;
  claimed_credit: number | null;
  achievement_name: string | null;
  level_name: string | null;
  submitted_at: string;
  student_id: string;
  review_source: string | null;
};

type ProfileLite = { user_id: string; full_name: string | null; student_no: string | null };

const FILTERS: Record<string, string[]> = {
  all: [],
  pending_review: ["pending_review"],
  auto_approved: ["auto_approved"],
  rejected_by_ai: ["rejected_by_ai"],
  approved: ["approved"],
  rejected: ["rejected"],
  pending_ai: ["pending_ai"],
  finished: ["approved", "rejected"],
};

const ReviewsList = () => {
  const navigate = useNavigate();
  const { collegeId, isSuperAdmin } = useAuth();
  const [params] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [profiles, setProfiles] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const initial = params.get("status") && FILTERS[params.get("status")!] ? params.get("status")! : "pending_review";
  const [tab, setTab] = useState(initial);
  const [reviewCounts, setReviewCounts] = useState<Map<string, number>>(new Map());
  const [page, setPage] = useState(0);
  const [latestWindowId, setLatestWindowId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let q = supabase.from("submission_windows").select("id").order("starts_at", { ascending: false }).limit(1);
      if (collegeId) q = q.eq("college_id", collegeId);
      const { data } = await q;
      if (!cancelled) setLatestWindowId(data?.[0]?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [collegeId]);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "ai_uncertain" | "student_appeal">("all");
  const PAGE_SIZE = 50;

  useEffect(() => {
    const s = params.get("status");
    if (s && FILTERS[s] && s !== tab) setTab(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // 切换 tab/搜索/来源筛选时回到第 0 页
  useEffect(() => { setPage(0); }, [tab, debounced, sourceFilter]);
  // 切换出"待复核"时清空来源筛选
  useEffect(() => { if (tab !== "pending_review") setSourceFilter("all"); }, [tab]);

  const load = useCallback(async () => {
    setLoading(true);
    // 若搜索非空，先按姓名/学号定位 student_id
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
      .select("id, description, status, ai_suggested_credit, ai_confidence, final_credit, claimed_credit, achievement_name, level_name, submitted_at, student_id, review_source", { count: "exact" })
      .order("submitted_at", { ascending: false });
    if (FILTERS[tab].length) q = q.in("status", FILTERS[tab] as any);
    if (sourceFilter !== "all" && tab === "pending_review") {
      q = q.eq("review_source", sourceFilter);
    }
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
        .select("user_id, full_name, student_no")
        .in("user_id", ids);
      const m = new Map<string, ProfileLite>();
      (profs ?? []).forEach((p) => m.set(p.user_id, p));
      setProfiles(m);
    } else {
      setProfiles(new Map());
    }

    // 统计每个申请已发生的人工复核次数（teacher_review / admin_review）
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
  }, [tab, page, debounced, sourceFilter]);

  // Coalesce concurrent invocations and prevent stale-response overwrites.
  const reload = useSerializedReload(load);
  useEffect(() => { reload(); }, [reload, load]);
  const collegeFilter = isSuperAdmin ? undefined : (collegeId ? `college_id=eq.${collegeId}` : null);
  useRealtimeTable("applications", reload, { filter: collegeFilter });

  const tabLabel = useMemo(() => ({
    all: "全部", pending_review: "待教师复核", auto_approved: "系统已通过",
    rejected_by_ai: "系统未通过", approved: "已通过", rejected: "已驳回",
    pending_ai: "系统核验中", finished: "已完成",
  } as Record<string, string>), []);

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="申请审核"
          description="按状态筛选并处理学分申请"
          actions={
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索学生姓名/学号"
                className="w-56"
              />
              {latestWindowId && (
                <Button variant="outline" onClick={() => navigate(`/admin/windows/${latestWindowId}/export`)}>
                  导出学生材料
                </Button>
              )}
            </div>
          }
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="pending_ai">系统核验中</TabsTrigger>
            <TabsTrigger value="pending_review">待教师复核</TabsTrigger>
            <TabsTrigger value="auto_approved">系统已通过</TabsTrigger>
            <TabsTrigger value="rejected_by_ai">系统未通过</TabsTrigger>
            <TabsTrigger value="finished">人工已完成</TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === "pending_review" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">复核来源：</span>
            {([
              ["all", "全部"],
              ["ai_uncertain", "AI 转人工"],
              ["student_appeal", "学生申诉"],
            ] as const).map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={sourceFilter === k ? "default" : "outline"}
                onClick={() => setSourceFilter(k)}
              >
                {label}
              </Button>
            ))}
          </div>
        )}
        <Card>
          <CardHeader><CardTitle className="text-base">共 {total} 条 · {tabLabel[tab] ?? tab}</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>学生</TableHead>
                <TableHead>说明</TableHead>
                <TableHead>自报/认定学分</TableHead>
                <TableHead>判定确信度</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>提交时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={5} cols={7} />
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7}><EmptyState title="暂无记录" description="切换筛选标签或等待新申请" /></TableCell></TableRow>
                ) : rows.map((r) => {
                  const p = profiles.get(r.student_id);
                  const prev = reviewCounts.get(r.id) ?? 0;
                  const isReReview = r.status === "pending_review" && prev >= 1;
                  const rejectedDisplay = r.status === "rejected" || r.status === "rejected_by_ai";
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{p?.full_name ?? "—"} <span className="text-xs text-muted-foreground">{p?.student_no}</span></TableCell>
                      <TableCell className="max-w-xs truncate">
                        {r.achievement_name
                          ? `${r.achievement_name}${r.level_name ? `（${r.level_name}）` : ""}`
                          : r.description}
                      </TableCell>
                      <TableCell>
                        {rejectedDisplay ? 0 : (() => {
                          const credit = r.final_credit ?? r.claimed_credit ?? r.ai_suggested_credit;
                          if (credit == null) return "—";
                          return r.final_credit == null && r.claimed_credit != null
                            ? <span>{credit} <span className="text-xs text-muted-foreground">自报</span></span>
                            : credit;
                        })()}
                      </TableCell>
                      <TableCell>
                        <ConfidenceBadge
                          status={r.status}
                          confidence={r.ai_confidence}
                          reviewSource={r.review_source}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={r.status} />
                          {r.status === "pending_review" && (
                            <ReviewSourceBadge source={r.review_source} />
                          )}
                          {isReReview && (
                            <Badge variant="destructive">⚠ 第 {prev + 1} 次复核</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" onClick={() => navigate(`/applications/${r.id}`)}>查看</Button>
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
    </AppLayout>
  );
};

export default ReviewsList;
