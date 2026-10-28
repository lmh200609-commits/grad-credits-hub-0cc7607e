import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { RefreshCw, Trash2, Activity } from "lucide-react";
import { displayError } from "@/lib/displayText";

/**
 * Real-time consistency check.
 *
 * For each watched table we keep:
 *   - the LAST realtime payload we received in this browser tab
 *     (event type, primary key, our local receive time)
 *   - the SERVER ground truth: row count + max(updated_at, created_at)
 *
 * Then we compare:
 *   - if server.maxChangedAt > lastEventAt + TOLERANCE_MS
 *     → "drift": realtime missed something the server already has
 *   - else "in sync"
 *
 * The check works for any signed-in role; RLS automatically scopes
 * what each role can see, so a student only sees their own rows.
 */

type TableKey =
  | "applications"
  | "application_reviews"
  | "submission_records"
  | "profiles"
  | "user_roles";

type TimeCol = "updated_at" | "created_at";

type Spec = {
  table: TableKey;
  label: string;
  /** Column we treat as "last changed at" (server side). */
  changedCol: TimeCol;
  /** Realtime publication actually carries this table? */
  realtimeEnabled: boolean;
};

const SPECS: Spec[] = [
  { table: "applications",        label: "申请",       changedCol: "updated_at", realtimeEnabled: true },
  { table: "application_reviews", label: "审核明细",   changedCol: "created_at", realtimeEnabled: true },
  { table: "submission_records",  label: "提交记录",   changedCol: "created_at", realtimeEnabled: true },
  { table: "profiles",            label: "用户档案",   changedCol: "updated_at", realtimeEnabled: true },
  { table: "user_roles",          label: "用户角色",   changedCol: "created_at", realtimeEnabled: false },
];

const TOLERANCE_MS = 5_000;

const EVENT_LABEL: Record<string, string> = {
  INSERT: "新增",
  UPDATE: "更新",
  DELETE: "删除",
  RECONNECT: "重连",
  POLL: "轮询",
};
const eventLabel = (t?: string) => (t ? EVENT_LABEL[t] ?? "事件" : "—");

const ROLE_LABEL: Record<string, string> = {
  super_admin: "超级管理员",
  college_admin: "学院管理员",
  admin: "学院管理员",
  teacher: "教师",
  student: "学生",
  guest: "访客",
};

type EventInfo = {
  type: string;          // INSERT / UPDATE / DELETE / RECONNECT / POLL
  pk: string | null;     // best-effort id
  receivedAt: number;    // local ms
};

type ServerInfo = {
  rowCount: number | null;
  maxChangedAt: string | null; // ISO string
  fetchedAt: number;           // local ms
  error?: string;
};

const fmtTime = (ts: number | null | undefined) =>
  ts ? new Date(ts).toLocaleTimeString("zh-CN", { hour12: false }) : "—";
const fmtIso = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("zh-CN", { hour12: false }) : "—";

const RealtimeDiagnostics = () => {
  const { roles } = useAuth();
  const role = roles[0] ?? "guest";
  const roleLabel = ROLE_LABEL[role] ?? role;

  const [events, setEvents] = useState<Record<TableKey, EventInfo | null>>(() => {
    const init = {} as Record<TableKey, EventInfo | null>;
    SPECS.forEach((s) => { init[s.table] = null; });
    return init;
  });

  const [server, setServer] = useState<Record<TableKey, ServerInfo | null>>(() => {
    const init = {} as Record<TableKey, ServerInfo | null>;
    SPECS.forEach((s) => { init[s.table] = null; });
    return init;
  });

  const [refreshing, setRefreshing] = useState(false);
  const seqRef = useRef(0);
  const mountedAtRef = useRef<number>(Date.now());

  // Compare table — recomputed on every state change.
  const rows = useMemo(() => SPECS.map((spec) => {
    const ev = events[spec.table];
    const srv = server[spec.table];
    const lastEventTs = ev?.receivedAt ?? null;
    const maxChangedTs = srv?.maxChangedAt ? new Date(srv.maxChangedAt).getTime() : null;

    let status: "ok" | "drift" | "no-data" | "no-realtime" = "no-data";
    let detail = "";

    if (!spec.realtimeEnabled) {
      status = "no-realtime";
      detail = "该表未加入实时发布通道，仅依赖轮询";
    } else if (srv?.error) {
      status = "no-data";
      detail = `查询失败：${displayError(srv.error)}`;
    } else if (maxChangedTs == null) {
      status = srv?.rowCount === 0 ? "ok" : "no-data";
      detail = srv?.rowCount === 0 ? "无可见行" : "尚未拉取服务端时间";
    } else if (lastEventTs == null) {
      // Server has data but realtime never fired in this tab.
      // It's only a drift if the row changed AFTER we mounted and TOLERANCE elapsed.
      const driftMs = Date.now() - maxChangedTs;
      if (driftMs > TOLERANCE_MS && maxChangedTs > mountedAtRef.current) {
        status = "drift";
        detail = `服务端有变更但本会话未收到任何事件（落后 ${Math.round(driftMs/1000)}s）`;
      } else {
        status = "ok";
        detail = "本会话期间无变更";
      }
    } else {
      const driftMs = maxChangedTs - lastEventTs;
      if (driftMs > TOLERANCE_MS) {
        status = "drift";
        detail = `服务端最新变更比最后一次事件晚 ${Math.round(driftMs/1000)}s`;
      } else {
        status = "ok";
        detail = "已对齐";
      }
    }
    return { spec, ev, srv, status, detail, lastEventTs, maxChangedTs };
  }), [events, server]);

  const fetchServerSnapshot = useCallback(async () => {
    setRefreshing(true);
    const mySeq = ++seqRef.current;
    const next: Record<TableKey, ServerInfo> = {} as Record<TableKey, ServerInfo>;
    await Promise.all(SPECS.map(async (spec) => {
      try {
        // Row count (head request, RLS-scoped).
        const { count, error: cErr } = await supabase
          .from(spec.table)
          .select("*", { count: "exact", head: true });
        if (cErr) throw cErr;

        // Max changed-at; nullable when there are 0 visible rows.
        const { data, error: tErr } = await supabase
          .from(spec.table)
          .select(spec.changedCol)
          .order(spec.changedCol, { ascending: false })
          .limit(1)
          .maybeSingle();
        if (tErr && tErr.code !== "PGRST116") throw tErr;

        const ts = data ? (data as Record<string, string>)[spec.changedCol] : null;
        next[spec.table] = {
          rowCount: count ?? 0,
          maxChangedAt: ts ?? null,
          fetchedAt: Date.now(),
        };
      } catch (e) {
        next[spec.table] = {
          rowCount: null,
          maxChangedAt: null,
          fetchedAt: Date.now(),
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }));
    if (mySeq === seqRef.current) {
      setServer((prev) => ({ ...prev, ...next }));
    }
    setRefreshing(false);
  }, []);

  // Initial fetch + auto-refresh every 15s so server side stays fresh.
  useEffect(() => {
    fetchServerSnapshot();
    const id = setInterval(fetchServerSnapshot, 15_000);
    return () => clearInterval(id);
  }, [fetchServerSnapshot]);

  // ---- Realtime listeners (one hook per watched table) ----
  // We can't put `useRealtimeTable` inside a loop, but we can call it once
  // per table (hook order is stable because SPECS is constant).
  const recordEvent = useCallback((table: TableKey, payload: { eventType?: string; new?: { id?: string }; old?: { id?: string } }) => {
    const type = String(payload?.eventType ?? "?");
    // Ignore synthetic POLL/RECONNECT pings — they don't represent a row change.
    if (type === "POLL") return;
    const pk = (payload?.new?.id ?? payload?.old?.id) ?? null;
    setEvents((prev) => ({ ...prev, [table]: { type, pk, receivedAt: Date.now() } }));
    // After a real event, re-fetch server snapshot so the comparison is fresh.
    fetchServerSnapshot();
  }, [fetchServerSnapshot]);

  useRealtimeTable("applications",        (p) => recordEvent("applications", p));
  useRealtimeTable("application_reviews", (p) => recordEvent("application_reviews", p));
  useRealtimeTable("submission_records",  (p) => recordEvent("submission_records", p));
  useRealtimeTable("profiles",            (p) => recordEvent("profiles", p));
  // user_roles is not in the publication — intentionally not subscribed.

  const clearEvents = () => {
    const blank = {} as Record<TableKey, EventInfo | null>;
    SPECS.forEach((s) => { blank[s.table] = null; });
    setEvents(blank);
    mountedAtRef.current = Date.now();
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="实时一致性检查"
          description="监听数据库实时事件，并与服务端最新状态比对，验证教师/管理员/学生三端是否同步。"
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1">
                <Activity className="h-3 w-3" /> 当前角色：{roleLabel}
              </Badge>
              <Button size="sm" variant="outline" onClick={fetchServerSnapshot} disabled={refreshing}>
                <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                刷新服务端
              </Button>
              <Button size="sm" variant="ghost" onClick={clearEvents}>
                <Trash2 className="mr-1 h-4 w-4" /> 清空事件
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">对比矩阵</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>数据表</TableHead>
                  <TableHead>最近实时事件</TableHead>
                  <TableHead>事件主键</TableHead>
                  <TableHead>事件接收时间</TableHead>
                  <TableHead>服务端可见行数</TableHead>
                  <TableHead>服务端最近变更</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ spec, ev, srv, status, detail, lastEventTs }) => (
                  <TableRow key={spec.table}>
                    <TableCell className="font-medium">{spec.label}</TableCell>
                    <TableCell>
                      {ev ? <Badge variant="secondary">{eventLabel(ev.type)}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{ev?.pk ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtTime(lastEventTs)}</TableCell>
                    <TableCell>{srv?.rowCount ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmtIso(srv?.maxChangedAt ?? null)}</TableCell>
                    <TableCell>
                      {status === "ok" && <Badge className="bg-success/15 text-success hover:bg-success/15">已对齐</Badge>}
                      {status === "drift" && <Badge className="bg-danger/15 text-danger hover:bg-danger/15">可能漏事件</Badge>}
                      {status === "no-data" && <Badge variant="outline">数据不足</Badge>}
                      {status === "no-realtime" && <Badge variant="outline">未启用实时</Badge>}
                      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. 不同角色登录后打开本页面，行数与"服务端最近变更"会按权限策略自动过滤——学生只看到自己的行，教师/管理员看到全部。</p>
            <p>2. 在另一个浏览器/窗口里执行操作（提交申请、教师审核），本页面对应表的"最近实时事件"应在 1 秒内更新。</p>
            <p>3. 服务端快照每 15 秒自动刷新一次，也可手动点"刷新服务端"。</p>
            <p>4. 当"服务端最近变更"晚于"事件接收时间"超过 {TOLERANCE_MS / 1000}s，本页面会标红"可能漏事件"。</p>
            <p>5. "用户角色"表未加入实时发布，仅作为对照——其状态固定为"未启用实时"。</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default RealtimeDiagnostics;