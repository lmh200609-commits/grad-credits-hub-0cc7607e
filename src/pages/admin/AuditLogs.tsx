import { useEffect, useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import EmptyState from "@/components/EmptyState";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import TableSkeleton from "@/components/TableSkeleton";
import TablePagination from "@/components/TablePagination";
import { fetchAll } from "@/lib/fetchAll";
import { resolveDisplayName } from "@/lib/displayName";
import { displayValue } from "@/lib/displayText";

const PAGE_SIZE = 30;

type AuditLog = {
  id: string;
  action: string;
  actor_id: string | null;
  actor_email: string | null;
  target_ids: string[];
  target_labels: string[];
  affected_count: number;
  success_count: number;
  failure_count: number;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const ACTION_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  import_users: { label: "批量导入", variant: "default" },
  delete_user: { label: "删除用户", variant: "destructive" },
  bulk_delete_users: { label: "批量删除", variant: "destructive" },
  reset_password: { label: "重置密码", variant: "secondary" },
  bulk_reset_password: { label: "批量重置密码", variant: "secondary" },
  role_change: { label: "角色变更", variant: "secondary" },
  rule_create: { label: "规则新增", variant: "default" },
  rule_update: { label: "规则更新", variant: "secondary" },
  rule_delete: { label: "规则删除", variant: "destructive" },
};

const ACTION_OPTIONS = ["all", ...Object.keys(ACTION_LABEL)];

const fmtTime = (s: string) => {
  const d = new Date(s);
  return d.toLocaleString("zh-CN", { hour12: false });
};

type ActorInfo = { label: string };

const ROLE_PRIORITY = ["super_admin", "admin", "teacher", "student"] as const;

const formatActor = (
  role: string | null,
  fullName: string | null,
  accountFallback: string,
  collegeLabel: string | null,
): string => {
  const name = resolveDisplayName({ full_name: fullName }, accountFallback);
  switch (role) {
    case "super_admin":
      return `超级管理员 ${name}`;
    case "admin":
      return `${collegeLabel ? collegeLabel : "学院"}管理员 ${name}`;
    case "teacher":
      return `教师 ${name}`;
    case "student":
      return `学生 ${name}`;
    default:
      return name;
  }
};

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actors, setActors] = useState<Record<string, ActorInfo>>({});
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [actorSearch, setActorSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await fetchAll<AuditLog>(
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }),
    );
    setLogs(data);
    await loadActors(data);
    setLoading(false);
  };

  const loadActors = async (rows: AuditLog[]) => {
    const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)));
    if (ids.length === 0) {
      setActors({});
      return;
    }
    const emailById = new Map<string, string | null>();
    rows.forEach((r) => { if (r.actor_id && !emailById.has(r.actor_id)) emailById.set(r.actor_id, r.actor_email); });

    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("user_id, full_name").in("user_id", ids),
      supabase.from("user_roles").select("user_id, role, college_id").in("user_id", ids),
    ]);
    const profiles = profilesRes.data ?? [];
    const roles = rolesRes.data ?? [];

    const collegeIds = Array.from(new Set(
      roles.map((r) => r.college_id).filter((x): x is string => !!x),
    ));
    let collegeMap = new Map<string, string>();
    if (collegeIds.length > 0) {
      const { data: cols } = await supabase
        .from("colleges")
        .select("id, name, short_name")
        .in("id", collegeIds);
      (cols ?? []).forEach((c: any) => collegeMap.set(c.id, c.short_name || c.name));
    }

    const profileMap = new Map<string, string | null>();
    profiles.forEach((p: any) => profileMap.set(p.user_id, p.full_name));

    // pick top-priority role per user
    const rolesByUser = new Map<string, { role: string; college_id: string | null }[]>();
    roles.forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push({ role: r.role, college_id: r.college_id });
      rolesByUser.set(r.user_id, arr);
    });

    const map: Record<string, ActorInfo> = {};
    ids.forEach((uid) => {
      const userRoles = rolesByUser.get(uid) ?? [];
      const sorted = [...userRoles].sort(
        (a, b) => ROLE_PRIORITY.indexOf(a.role as any) - ROLE_PRIORITY.indexOf(b.role as any),
      );
      const top = sorted[0];
      const fullName = profileMap.get(uid) ?? null;
      const emailPrefix = (emailById.get(uid) ?? "").split("@")[0] ?? "";
      const collegeLabel = top?.college_id ? collegeMap.get(top.college_id) ?? null : null;
      map[uid] = { label: formatActor(top?.role ?? null, fullName, emailPrefix, collegeLabel) };
    });
    setActors(map);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (actorSearch.trim() && !(l.actor_email ?? "").toLowerCase().includes(actorSearch.trim().toLowerCase())) return false;
      if (from && new Date(l.created_at) < new Date(from)) return false;
      if (to && new Date(l.created_at) > new Date(`${to}T23:59:59`)) return false;
      return true;
    });
  }, [logs, actionFilter, actorSearch, from, to]);

  useEffect(() => { setPage(0); }, [actionFilter, actorSearch, from, to]);
  const paged = useMemo(() => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filtered, page]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader title="审计日志" description="追踪批量导入、删除、角色变更与规则操作" />

        <Card>
          <CardHeader><CardTitle className="text-base">筛选</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">操作类型</Label>
              <SearchableSelect
                value={actionFilter}
                onChange={setActionFilter}
                options={ACTION_OPTIONS.map((a) => ({
                  value: a,
                  label: a === "all" ? "全部操作" : ACTION_LABEL[a]?.label ?? a,
                }))}
                placeholder="操作类型"
                searchPlaceholder="搜索操作…"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">操作者账号</Label>
              <Input placeholder="输入账号关键字" value={actorSearch} onChange={(e) => setActorSearch(e.target.value)} className="w-full" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">开始日期</Label>
              <DatePicker value={from} onChange={setFrom} placeholder="开始日期" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">结束日期</Label>
              <DatePicker value={to} onChange={setTo} placeholder="结束日期" />
            </div>
            <div className="md:col-span-2 xl:col-span-4 text-sm text-muted-foreground">
              共 {filtered.length} / {logs.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>操作</TableHead>
                  <TableHead>操作者</TableHead>
                  <TableHead className="text-right">影响</TableHead>
                  <TableHead className="text-right">成功 / 失败</TableHead>
                  <TableHead className="text-right">耗时</TableHead>
                  <TableHead className="text-right">详情</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableSkeleton rows={6} cols={7} />
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7}><EmptyState title="暂无日志" description="完成一次批量操作后将在此处显示" /></TableCell></TableRow>
                ) : paged.map((l) => {
                  const meta = ACTION_LABEL[l.action] ?? { label: "其他操作", variant: "outline" as const };
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{fmtTime(l.created_at)}</TableCell>
                      <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {(l.actor_id && actors[l.actor_id]?.label)
                          || (l.actor_email ? l.actor_email.split("@")[0] : "—")}
                      </TableCell>
                      <TableCell className="text-right">{l.affected_count}</TableCell>
                      <TableCell className="text-right text-sm">
                        <span className="text-success">{l.success_count}</span>
                        {" / "}
                        <span className={l.failure_count > 0 ? "text-destructive" : "text-muted-foreground"}>{l.failure_count}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {l.duration_ms != null ? `${(l.duration_ms / 1000).toFixed(2)} 秒` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => setDetail(l)}>查看</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!loading && filtered.length > PAGE_SIZE && (
              <TablePagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail && (ACTION_LABEL[detail.action]?.label ?? "其他操作")} · {detail && fmtTime(detail.created_at)}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">操作者：</span>{
                  (detail.actor_id && actors[detail.actor_id]?.label)
                  || (detail.actor_email ? detail.actor_email.split("@")[0] : "—")
                }</div>
                <div>
                  <span className="text-muted-foreground">影响：</span>
                  共 {detail.affected_count} 条，成功 {detail.success_count}，失败 {detail.failure_count}
                  {detail.duration_ms != null && `，耗时 ${(detail.duration_ms / 1000).toFixed(2)} 秒`}
                </div>
                {detail.target_labels.length > 0 && (
                  <div>
                    <div className="mb-1 text-muted-foreground">受影响标识（{detail.target_labels.length}）：</div>
                    <div className="flex max-h-40 flex-wrap gap-1 overflow-auto rounded-md border bg-muted/30 p-2">
                      {detail.target_labels.map((t, i) => (
                        <Badge key={i} variant="outline" className="font-mono text-xs">{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="mb-1 text-muted-foreground">操作详情：</div>
                  <div className="whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
                    {Object.keys(detail.metadata ?? {}).length ? displayValue(detail.metadata) : "无补充详情"}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default AuditLogs;