import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { Clock, Lock } from "lucide-react";
import { deserializeItems } from "@/lib/parseForm";
import { applicationDescription } from "@/lib/applicationDisplay";

type Row = {
  id: string;
  description: string;
  status: any;
  ai_suggested_credit: number | null;
  final_credit: number | null;
  submitted_at: string;
  selected_keywords: string[] | null;
  custom_keywords: string[] | null;
  rules: { name: string } | null;
};

const MyApplications = () => {
  const { user, collegeId } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openWindow, setOpenWindow] = useState<{ id: string; name: string; starts_at: string; ends_at: string } | null>(null);
  const [nextWindow, setNextWindow] = useState<{ name: string; starts_at: string } | null>(null);
  const [windowChecked, setWindowChecked] = useState(false);

  useEffect(() => {
    (async () => {
      if (!collegeId) { setWindowChecked(true); return; }
      const nowIso = new Date().toISOString();
      const { data: cur } = await supabase
        .from("submission_windows")
        .select("id, name, starts_at, ends_at")
        .eq("college_id", collegeId)
        .eq("active", true)
        .lte("starts_at", nowIso)
        .gte("ends_at", nowIso)
        .order("ends_at", { ascending: true })
        .limit(1);
      const open = ((cur ?? [])[0] as any) ?? null;
      setOpenWindow(open);
      if (!open) {
        const { data: nx } = await supabase
          .from("submission_windows")
          .select("name, starts_at")
          .eq("college_id", collegeId)
          .eq("active", true)
          .gt("starts_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(1);
        setNextWindow(((nx ?? [])[0] as any) ?? null);
      }
      setWindowChecked(true);
    })();
  }, [collegeId]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("applications")
      .select("id, description, status, ai_suggested_credit, final_credit, submitted_at, selected_keywords, custom_keywords, rules:ai_matched_rule_id(name)")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false });
    setRows((data as any[]) ?? []);
    setLoading(false);
  }, [user]);

  const reload = useSerializedReload(load);
  useEffect(() => { reload(); }, [reload, load]);

  // Subscribe ONLY to this student's own applications. While auth is still
  // resolving (`user` is null), pass `null` so the hook skips subscribing
  // entirely instead of briefly listening to the whole table.
  useRealtimeTable(
    "applications",
    reload,
    { filter: user ? `student_id=eq.${user.id}` : null },
  );

  const getItemsSummary = (r: Row) => {
    const items = deserializeItems(r.description);
    if (items.length === 0) return applicationDescription(r.description);
    return items
      .map((it) => [it.achievement, it.level, it.credit != null ? `${it.credit} 学分` : null].filter(Boolean).join(" · "))
      .join("；");
  };

  const getAppTitle = (r: Row) => {
    const items = deserializeItems(r.description);
    if (items.length > 0) return items.map((it) => it.achievement).filter(Boolean).slice(0, 2).join(" · ") || "—";
    const c = (r.custom_keywords ?? []).filter(Boolean);
    if (c.length > 0) return c.slice(0, 2).join(" · ");
    const s = (r.selected_keywords ?? []).filter(Boolean);
    if (s.length > 0) return s.join(" · ");
    return applicationDescription(r.description, true).slice(0, 20);
  };


  const displayFinalCredit = (r: Row) => {
    if (r.status === "rejected" || r.status === "rejected_by_ai") return 0;
    return r.final_credit ?? "—";
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">我的申请</h1>
          <Button size="sm" onClick={() => navigate("/apply")}>新申请</Button>
        </div>
        {windowChecked && !collegeId && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-center gap-3 py-3 text-sm">
              <Lock className="h-5 w-5 text-destructive" />
              <div>
                <div className="font-medium">账号未分配学院，无法提交新申请</div>
                <div className="text-muted-foreground">请联系管理员为你的账号分配所属学院。</div>
              </div>
            </CardContent>
          </Card>
        )}
        {windowChecked && collegeId && openWindow && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center gap-3 py-3 text-sm">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">当前提交批次：{openWindow.name}</div>
                <div className="text-muted-foreground">
                  开放时间：{new Date(openWindow.starts_at).toLocaleString("zh-CN", { hour12: false })} 至 {new Date(openWindow.ends_at).toLocaleString("zh-CN", { hour12: false })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {windowChecked && collegeId && !openWindow && (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="flex items-center gap-3 py-3 text-sm">
              <Lock className="h-5 w-5 text-warning" />
              <div>
                <div className="font-medium">当前不在开放提交时间内，无法提交新申请</div>
                <div className="text-muted-foreground">
                  {nextWindow
                    ? `下一批次「${nextWindow.name}」将于 ${new Date(nextWindow.starts_at).toLocaleString("zh-CN", { hour12: false })} 开放`
                    : "请等待管理员开放新的提交批次"}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle className="text-base">共 {rows.length} 条</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>申请名字</TableHead><TableHead>说明</TableHead>
                <TableHead>状态</TableHead><TableHead>建议学分</TableHead>
                <TableHead>最终学分</TableHead><TableHead>提交时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={4} cols={7} />
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7}><EmptyState title="还没有申请" description="点击右上角「新申请」开始提交" /></TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{getAppTitle(r)}</TableCell>
                    <TableCell className="max-w-xs truncate">{getItemsSummary(r)}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} audience="student" />
                    </TableCell>
                    <TableCell>{r.ai_suggested_credit ?? "—"}</TableCell>
                    <TableCell>{displayFinalCredit(r)}</TableCell>
                    <TableCell className="text-xs">{new Date(r.submitted_at).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/applications/${r.id}`)}>详情</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default MyApplications;
