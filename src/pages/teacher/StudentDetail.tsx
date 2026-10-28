import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Database } from "@/integrations/supabase/types";
import { applicationDescription } from "@/lib/applicationDisplay";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Application = Database["public"]["Tables"]["applications"]["Row"];

const APPROVED_STATUSES: Application["status"][] = ["approved", "auto_approved"];

const StudentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", id).maybeSingle(),
        supabase.from("applications").select("*").eq("student_id", id).order("submitted_at", { ascending: false }),
      ]);
      setProfile(p ?? null);
      setApps(a ?? []);
      setLoading(false);
    })();
  }, [id]);

  const stats = useMemo(() => {
    const total = apps.length;
    const approved = apps.filter((a) => APPROVED_STATUSES.includes(a.status));
    const totalCredit = approved.reduce((s, a) => s + Number(a.final_credit ?? a.ai_suggested_credit ?? 0), 0);
    const pending = apps.filter((a) => a.status === "pending_ai" || a.status === "pending_review").length;
    const rejected = apps.filter((a) => a.status === "rejected" || a.status === "rejected_by_ai").length;
    return { total, approved: approved.length, totalCredit, pending, rejected };
  }, [apps]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
          <Link to="/teacher/students">← 返回学生列表</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{profile?.full_name ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-y-2 text-sm md:grid-cols-4">
            <Field label="学号" value={profile?.student_no} />
            <Field label="院系" value={profile?.department} />
            <Field label="专业" value={profile?.major} />
            <Field label="班级" value={profile?.class_name} />
            <Field label="手机号" value={profile?.phone} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="累计学分" value={stats.totalCredit.toFixed(1)} accent />
          <StatCard label="申请总数" value={stats.total} />
          <StatCard label="审核中" value={stats.pending} />
          <StatCard label="已驳回" value={stats.rejected} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">申请记录</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>提交时间</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">学分</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">加载中…</TableCell></TableRow>
                ) : apps.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">该学生暂无申请</TableCell></TableRow>
                ) : (
                  apps.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {new Date(a.submitted_at).toLocaleString("zh-CN", { hour12: false })}
                      </TableCell>
                      <TableCell className="max-w-md truncate">{applicationDescription(a.description, true)}</TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-right">
                        {a.final_credit ?? a.ai_suggested_credit ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to={`/applications/${a.id}`}>查看</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <div className="text-muted-foreground">{label}</div>
    <div className="font-medium">{value ?? "—"}</div>
  </div>
);

const StatCard = ({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </CardContent>
  </Card>
);

export default StudentDetail;
