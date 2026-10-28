import { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClipboardCheck, Sparkles } from "lucide-react";
import AigcStatsPanel from "@/components/AigcStatsPanel";

const PASS_THRESHOLD = 4;

const COLORS = ["#10b981", "#ef4444", "#f59e0b", "#3b82f6", "#a855f7", "#06b6d4"];
const DEPT_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f97316", "#8b5cf6", "#0ea5e9", "#84cc16", "#f43f5e"];
const PASS_COLORS = ["#10b981", "#ef4444"];

type DashboardStats = {
  kpi: { total: number; approved: number; pending: number; pending_ai: number; pending_review: number; rejected: number; total_credit: number };
  status: { name: string; value: number }[];
  pass: { pass: number; fail: number; total: number };
  trend: { date: string; count: number }[];
  dept: { name: string; value: number }[];
  rule_count: number;
  student_count: number;
  teacher_count: number;
};

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const { collegeId, isSuperAdmin } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);

  const load = useCallback(async () => {
    const { data: res, error } = await supabase.rpc("dashboard_stats", {
      _college: isSuperAdmin ? null : (collegeId ?? null),
      _pass_threshold: PASS_THRESHOLD,
    });
    if (!error && res) setData(res as unknown as DashboardStats);
  }, [collegeId, isSuperAdmin]);

  const reload = useSerializedReload(load);
  useEffect(() => { reload(); }, [reload, load]);

  const collegeFilter = isSuperAdmin ? undefined : (collegeId ? `college_id=eq.${collegeId}` : null);
  useRealtimeTable("applications", reload, { filter: collegeFilter });
  useRealtimeTable("profiles", reload, { filter: collegeFilter });

  const stats = data?.kpi ?? { total: 0, approved: 0, pending: 0, pending_ai: 0, pending_review: 0, rejected: 0, total_credit: 0 };
  const passStats = data?.pass ?? { pass: 0, fail: 0, total: 0 };
  const trend = data?.trend ?? [];
  const statusPie = data?.status ?? [];
  const deptStats = data?.dept ?? [];

  const passPie = useMemo(() => {
    if (!passStats.total) return [];
    return [
      { name: "合格", value: passStats.pass },
      { name: "不合格", value: passStats.fail },
    ];
  }, [passStats]);

  const fmtPct = (n: number) => passStats.total ? `${((n / passStats.total) * 100).toFixed(1)}%` : "—";

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="数据看板"
          description="学分认证申请、学生与规则概览"
          actions={
            <Button onClick={() => navigate("/reviews")} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-card">
              <ClipboardCheck className="mr-2 h-4 w-4" /> 打开待审核
            </Button>
          }
        />

        <Card className="border-primary/30 bg-primary/5 shadow-card">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">
              试试右下角的「工作助手」：用自然语言说「查看不合格学生」或「调出张三档案」即可一键跳转。
            </span>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="申请总数" value={stats.total} accent="text-indigo-600" />
          <StatCard label="已通过" value={stats.approved} accent="text-emerald-600" />
          <StatCard label="系统核验中" value={stats.pending_ai} accent="text-sky-600" onClick={() => navigate("/reviews?status=pending_ai")} />
          <StatCard label="待教师复核" value={stats.pending_review} accent="text-amber-600" onClick={() => navigate("/reviews?status=pending_review")} />
          <StatCard label="已拒绝" value={stats.rejected} accent="text-rose-600" />
          <StatCard label="累计学分" value={Number(stats.total_credit).toFixed(1)} accent="text-fuchsia-600" />
          <StatCard
            label={`合格人数（${fmtPct(passStats.pass)}）`}
            value={passStats.pass}
            accent="text-emerald-600"
            onClick={() => navigate("/teacher/credits?passFilter=pass")}
          />
          <StatCard
            label={`不合格人数（${fmtPct(passStats.fail)}）`}
            value={passStats.fail}
            accent="text-rose-600"
            onClick={() => navigate("/teacher/credits?passFilter=fail")}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">学生合格情况（阈值 ≥ {PASS_THRESHOLD} 学分）</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>类别</TableHead>
                  <TableHead className="text-right">人数</TableHead>
                  <TableHead className="text-right">占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="cursor-pointer hover:bg-success/10" onClick={() => navigate("/teacher/credits?passFilter=pass")}>
                  <TableCell className="font-medium text-success">合格</TableCell>
                  <TableCell className="text-right font-semibold">{passStats.pass}</TableCell>
                  <TableCell className="text-right">{fmtPct(passStats.pass)}</TableCell>
                </TableRow>
                <TableRow className="cursor-pointer hover:bg-danger/10" onClick={() => navigate("/teacher/credits?passFilter=fail")}>
                  <TableCell className="font-medium text-danger">不合格</TableCell>
                  <TableCell className="text-right font-semibold">{passStats.fail}</TableCell>
                  <TableCell className="text-right">{fmtPct(passStats.fail)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">合计</TableCell>
                  <TableCell className="text-right text-muted-foreground">{passStats.total}</TableCell>
                  <TableCell className="text-right text-muted-foreground">100%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <div className="h-[220px]">
              {passPie.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={passPie}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      label
                      className="cursor-pointer"
                      onClick={(d: any) => {
                        const filter = d?.name === "合格" ? "pass" : "fail";
                        navigate(`/teacher/credits?passFilter=${filter}`);
                      }}
                    >
                      {passPie.map((_, i) => <Cell key={i} fill={PASS_COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">最近 14 天提交趋势</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <defs>
                    <linearGradient id="lineGradT" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" className="text-xs" />
                  <YAxis allowDecimals={false} className="text-xs" />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="url(#lineGradT)" strokeWidth={3} dot={{ r: 3, fill: "#6366f1" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">申请状态分布</CardTitle></CardHeader>
            <CardContent className="h-[280px]">
              {statusPie.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">暂无数据</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={90} label>
                      {statusPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <AigcStatsPanel />

        <Card>
          <CardHeader><CardTitle className="text-base">快捷入口</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <QuickLink to="/reviews" title="待审核" desc="处理待教师复核与已审申请" />
            <QuickLink to="/teacher/credits" title="学分统计" desc="按班级学号汇总学分与等级" />
            <QuickLink to="/teacher/students" title="学生管理" desc="查看学生档案与申请" />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

const StatCard = ({ label, value, accent, onClick }: { label: string; value: string | number; accent?: string; onClick?: () => void }) => (
  <Card onClick={onClick} className={onClick ? "cursor-pointer transition hover:border-primary hover:shadow-md" : undefined}>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
    </CardContent>
  </Card>
);

const QuickLink = ({ to, title, desc }: { to: string; title: string; desc: string }) => (
  <Link to={to} className="rounded-lg border p-4 transition hover:border-primary hover:bg-muted/30">
    <div className="font-medium">{title}</div>
    <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
  </Link>
);

export default TeacherDashboard;