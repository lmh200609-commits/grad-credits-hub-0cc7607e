import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewTheme } from "@/hooks/usePreviewTheme";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import ProcessSteps from "@/components/ProcessSteps";
import { StatusBadge } from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveDisplayName } from "@/lib/displayName";
import { deserializeItems } from "@/lib/parseForm";
import {
  ClipboardCheck, FileText, Send, Users, Inbox, CheckCircle2, XCircle,
  Clock, ArrowRight, Sparkles, FileCheck,
} from "lucide-react";

const appTitle = (description: string) => {
  const items = deserializeItems(description);
  if (items.length > 0) {
    const t = items.map((it) => it.achievement).filter(Boolean).slice(0, 2).join(" · ");
    if (t) return t;
  }
  return description?.trim() ? description.trim().slice(0, 40) : "未命名申请";
};

type AppRow = {
  id: string;
  description: string;
  status: "pending_ai" | "auto_approved" | "pending_review" | "rejected_by_ai" | "approved" | "rejected";
  submitted_at: string;
};

const StudentWorkbench = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const account = user?.email?.split("@")[0] ?? "";
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0, reviewing: 0, approved: 0, rejected: 0 });
  const [recent, setRecent] = useState<AppRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    setDisplayName(resolveDisplayName(prof, account));
    const { data } = await supabase
      .from("applications")
      .select("id,description,status,submitted_at")
      .eq("student_id", user.id)
      .order("submitted_at", { ascending: false });
    const rows = (data ?? []) as AppRow[];
    const reviewing = rows.filter((r) =>
      ["pending_ai", "auto_approved", "pending_review"].includes(r.status),
    ).length;
    const approved = rows.filter((r) => r.status === "approved").length;
    const rejected = rows.filter((r) => ["rejected", "rejected_by_ai"].includes(r.status)).length;
    setCounts({ total: rows.length, reviewing, approved, rejected });
    setRecent(rows.slice(0, 5));
    setLoading(false);
  }, [user, account]);

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

  const latest = recent[0];
  const stepInfo = useMemo(() => {
    const steps = [
      { label: "提交材料", description: "填写并上传" },
      { label: "审核中", description: "等待审核结果" },
      { label: "审核完成", description: "查看学分" },
    ];
    if (!latest) return { steps, current: 0, failed: false };
    const map: Record<AppRow["status"], { current: number; failed: boolean }> = {
      pending_ai: { current: 1, failed: false },
      auto_approved: { current: 1, failed: false },
      pending_review: { current: 1, failed: false },
      rejected_by_ai: { current: 1, failed: false },
      approved: { current: 2, failed: false },
      rejected: { current: 2, failed: true },
    };
    return { steps, ...map[latest.status] };
  }, [latest]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`你好，${displayName || account} 👋`}
        description="这里是你的学分认证工作台，一眼掌握所有进度。"
        actions={
          <Button onClick={() => navigate("/apply")} className="bg-gradient-primary text-primary-foreground shadow-card transition-transform active:scale-[0.98]">
            <Send className="h-4 w-4" /> 申请学分
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="已提交申请" value={counts.total} icon={FileText} tone="primary" loading={loading} onClick={() => navigate("/my-applications")} />
        <StatCard label="审核中" value={counts.reviewing} icon={Clock} tone="warning" loading={loading} hint="等待审核结果" />
        <StatCard label="已通过" value={counts.approved} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard label="已拒绝" value={counts.rejected} icon={XCircle} tone="danger" loading={loading} />
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">最新一份申请的进度</CardTitle>
          <CardDescription>
            {latest ? "根据你最近提交的申请自动推断当前阶段。" : "尚未提交申请，立即开始你的第一份。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProcessSteps steps={stepInfo.steps} currentStep={stepInfo.current} failed={stepInfo.failed} />
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <Card
            onClick={() => navigate("/apply")}
            className="group relative cursor-pointer overflow-hidden border-0 bg-gradient-primary p-6 text-primary-foreground shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">申请学分</h3>
                <p className="mt-1 text-sm opacity-90">下载模板填表，上传申请表与佐证材料即可提交。</p>
              </div>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card
              onClick={() => navigate("/my-applications")}
              className="group cursor-pointer p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">我的申请</h4>
                  <p className="text-xs text-muted-foreground">查看历史与状态</p>
                </div>
              </div>
            </Card>
            <Card
              onClick={() => navigate("/apply")}
              className="group cursor-pointer p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15 text-success">
                  <FileCheck className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">上传材料</h4>
                  <p className="text-xs text-muted-foreground">补充证明附件</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Card className="lg:col-span-2 shadow-card">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">最近申请</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/my-applications")}>
              全部 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                title="还没有申请"
                description="提交你的第一份学分认证吧。"
                action={<Button size="sm" onClick={() => navigate("/apply")}>去申请</Button>}
              />
            ) : (
              <ul className="divide-y">
                {recent.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => navigate(`/applications/${r.id}`)}
                    className="flex cursor-pointer items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{appTitle(r.description)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.submitted_at).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <StatusBadge status={r.status} audience="student" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const TeacherWorkbench = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const account = user?.email?.split("@")[0] ?? "";
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ pending: 0, todayDone: 0, weekRate: 0, students: 0 });
  const [queue, setQueue] = useState<AppRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      setDisplayName(resolveDisplayName(prof, account));
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
      const [pendingRes, queueRes, todayRes, weekRes, studentsRes] = await Promise.all([
        supabase.from("applications").select("id", { count: "exact", head: true }).eq("status", "pending_review"),
        supabase.from("applications").select("id,description,status,submitted_at").eq("status", "pending_review").order("submitted_at", { ascending: true }).limit(5),
        supabase.from("application_reviews").select("id", { count: "exact", head: true }).eq("reviewer_id", user.id).gte("created_at", todayStart.toISOString()),
        supabase.from("application_reviews").select("application_id,decision").in("decision", ["approved", "rejected"]).gte("created_at", weekStart.toISOString()),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "student"),
      ]);
      // 按申请去重：一份申请可能有多条复核记录，只取最新的 decision
      const weekRows = (weekRes.data ?? []) as { application_id: string; decision: string }[];
      const latestByApp = new Map<string, string>();
      for (const r of weekRows) latestByApp.set(r.application_id, r.decision);
      const decisions = Array.from(latestByApp.values());
      const approvedCount = decisions.filter((d) => d === "approved").length;
      const rate = decisions.length ? Math.round((approvedCount / decisions.length) * 100) : 0;
      setCounts({
        pending: pendingRes.count ?? 0,
        todayDone: todayRes.count ?? 0,
        weekRate: rate,
        students: studentsRes.count ?? 0,
      });
      setQueue((queueRes.data ?? []) as AppRow[]);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`你好，${displayName || account} 👋`}
        description="教师工作台 — 待审核任务与学生情况一目了然。"
        actions={
          <Button onClick={() => navigate("/reviews")} className="bg-gradient-primary text-primary-foreground shadow-card active:scale-[0.98]">
            <ClipboardCheck className="h-4 w-4" /> 去审核
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="待我审核" value={counts.pending} icon={Inbox} tone="warning" loading={loading} onClick={() => navigate("/reviews")} />
        <StatCard label="今日已审" value={counts.todayDone} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard label="本周通过率" value={`${counts.weekRate}%`} icon={Sparkles} tone="primary" loading={loading} />
        <StatCard label="学生总数" value={counts.students} icon={Users} tone="info" loading={loading} onClick={() => navigate("/teacher/students")} />
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">教师审核工作流</CardTitle>
          <CardDescription>学生提交后，AI 预审通过且置信度不足的会进入你的复核队列。</CardDescription>
        </CardHeader>
        <CardContent>
          <ProcessSteps
            steps={[
              { label: "学生提交" },
              { label: "AI 预审" },
              { label: "教师复核", description: "你在这里" },
              { label: "结果通知" },
            ]}
            currentStep={2}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <Card
            onClick={() => navigate("/reviews")}
            className="group relative cursor-pointer overflow-hidden border-0 bg-gradient-primary p-6 text-primary-foreground shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
                <ClipboardCheck className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold">前往复核中心</h3>
                <p className="mt-1 text-sm opacity-90">{counts.pending} 条申请正等待你的判断。</p>
              </div>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
          <Card
            onClick={() => navigate("/teacher/students")}
            className="group cursor-pointer p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-cardHover"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-info/10 text-info">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-medium">学生管理</h4>
                <p className="text-xs text-muted-foreground">查看学生学分明细与历史申请</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-2 shadow-card">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">待审核队列</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/reviews")}>
              全部 <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}
              </div>
            ) : queue.length === 0 ? (
              <EmptyState title="队列为空" description="目前没有待你审核的申请。" />
            ) : (
              <ul className="divide-y">
                {queue.map((r) => (
                  <li
                    key={r.id}
                    onClick={() => navigate(`/applications/${r.id}`)}
                    className="flex cursor-pointer items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40 -mx-2 px-2 rounded-md"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{appTitle(r.description)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.submitted_at).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Index = () => {
  const { hasRole, isSuperAdmin, loading } = useAuth();
  const { active: previewActive, roleView } = usePreviewTheme();
  if (loading) return <AppLayout><div className="h-32 animate-pulse rounded-md bg-muted" /></AppLayout>;
  // 预览模式下，按预览视角渲染对应工作台，避免真实角色重定向打断侧边栏选中状态
  if (previewActive && roleView) {
    if (roleView === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (roleView === "teacher") return <AppLayout><TeacherWorkbench /></AppLayout>;
    return <AppLayout><StudentWorkbench /></AppLayout>;
  }
  if (isSuperAdmin) return <Navigate to="/super/colleges" replace />;
  if (hasRole("admin")) return <Navigate to="/admin/dashboard" replace />;
  return (
    <AppLayout>
      {hasRole("teacher") ? <TeacherWorkbench /> : <StudentWorkbench />}
    </AppLayout>
  );
};

export default Index;
