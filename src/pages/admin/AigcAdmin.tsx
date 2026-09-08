import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { ScanEye, RefreshCw, Loader2, AlertTriangle, ShieldCheck, Image as ImageIcon } from "lucide-react";
import { toastErrorLegacy } from "@/lib/errors";

const DEFAULT_SUSPECT = 0.4;
const DEFAULT_FAKE = 0.8;

type College = {
  id: string;
  name: string;
  short_name: string | null;
  theme: any;
};

type Stats = {
  pending: number;
  real: number;
  suspect: number;
  fake: number;
  skipped: number;
  error: number;
};

type Failure = {
  id: string;
  application_id: string;
  attempts: number;
  last_error: string | null;
  failed_at: string;
};

const AigcAdmin = () => {
  const [loading, setLoading] = useState(true);
  const [colleges, setColleges] = useState<College[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, real: 0, suspect: 0, fake: 0, skipped: 0, error: 0 });
  const [queueDepth, setQueueDepth] = useState(0);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [colRes, qRes, failRes, ...statRes] = await Promise.all([
        supabase.from("colleges").select("id, name, short_name, theme").order("name"),
        supabase.from("aigc_detect_queue").select("id", { count: "exact", head: true }).in("status", ["queued", "failed"]),
        supabase.from("aigc_detect_failures").select("id, application_id, attempts, last_error, failed_at").order("failed_at", { ascending: false }).limit(20),
        ...(["pending", "real", "suspect", "fake", "skipped", "error"].map((s) =>
          supabase.from("applications").select("id", { count: "exact", head: true }).eq("aigc_status", s)
        )),
      ]);
      if (colRes.error) throw colRes.error;
      setColleges((colRes.data as any) || []);
      setQueueDepth(qRes.count || 0);
      setFailures((failRes.data as any) || []);
      const [p, r, s, f, sk, er] = statRes;
      setStats({
        pending: p.count || 0, real: r.count || 0, suspect: s.count || 0,
        fake: f.count || 0, skipped: sk.count || 0, error: er.count || 0,
      });
    } catch (e) {
      toastErrorLegacy(e, "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveCollege = async (col: College, patch: { enabled?: boolean; suspect?: number; fake?: number }) => {
    const oldAigc = (col.theme as any)?.aigc || {};
    const nextAigc = {
      enabled: patch.enabled ?? oldAigc.enabled ?? true,
      suspect: patch.suspect ?? oldAigc.suspect ?? DEFAULT_SUSPECT,
      fake: patch.fake ?? oldAigc.fake ?? DEFAULT_FAKE,
    };
    const nextTheme = { ...(col.theme || {}), aigc: nextAigc };
    const { error } = await supabase.from("colleges").update({ theme: nextTheme }).eq("id", col.id);
    if (error) {
      toastErrorLegacy(error, "保存失败");
      return;
    }
    setColleges((arr) => arr.map((c) => (c.id === col.id ? { ...c, theme: nextTheme } : c)));
    toast({ title: "已更新", description: `${col.short_name || col.name} · AIGC 配置已保存` });
  };

  const runWorker = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-aigc-queue", { body: {} });
      if (error) throw error;
      const claimed = (data as any)?.claimed ?? 0;
      const results = ((data as any)?.results ?? []) as Array<{ ok: boolean }>;
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      toast({
        title: "已触发处理",
        description: claimed === 0
          ? "当前没有待处理任务"
          : `本次领取 ${claimed} 条，成功 ${ok} 条，失败 ${fail} 条`,
      });
      await load();
    } catch (e) {
      toastErrorLegacy(e, "执行失败");
    } finally {
      setRunning(false);
    }
  };

  const retryOne = async (application_id: string) => {
    try {
      const { error } = await supabase.functions.invoke("aigc-detect", { body: { application_id } });
      if (error) throw error;
      toast({ title: "已重新检测", description: application_id.slice(0, 8) });
      await load();
    } catch (e) {
      toastErrorLegacy(e, "重试失败");
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="AIGC 图像鉴别"
          description="阿里云内容安全 · AI 生成图片鉴别旗舰版。审查学生提交的证书/材料图片是否为豆包、即梦、通义万相、midjourney、混元等 AI 模型生成。密钥已通过密钥管理安全存储。"
          actions={
            <Button onClick={runWorker} disabled={running}>
              {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
              立即处理待检测队列
            </Button>
          }
        />

        {/* 总体统计 */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-7">
          <StatCard label="待检测队列" value={queueDepth} tone="muted" icon={<ImageIcon className="h-4 w-4" />} />
          <StatCard label="待处理" value={stats.pending} tone="muted" />
          <StatCard label="真实" value={stats.real} tone="success" icon={<ShieldCheck className="h-4 w-4" />} />
          <StatCard label="疑似" value={stats.suspect} tone="warn" />
          <StatCard label="判定 AI 生成" value={stats.fake} tone="error" icon={<AlertTriangle className="h-4 w-4" />} />
          <StatCard label="跳过" value={stats.skipped} tone="muted" />
          <StatCard label="错误" value={stats.error} tone="error" />
        </div>

        {/* 学院级阈值 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanEye className="h-4 w-4" /> 学院级配置
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              每个学院可单独开关并设置阈值。<b>疑似阈值</b>：分数 ≥ 此值则向 AI 评估注入风险信号、禁止自动通过；<b>判定阈值</b>：分数 ≥ 此值则直接判定为 AI 生成图并拒绝。默认 0.4 / 0.8。
            </p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>学院</TableHead>
                    <TableHead className="w-[110px]">启用</TableHead>
                    <TableHead className="w-[140px]">疑似阈值</TableHead>
                    <TableHead className="w-[140px]">判定阈值</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colleges.map((col) => {
                    const cfg = (col.theme as any)?.aigc || {};
                    const enabled = cfg.enabled !== false;
                    return (
                      <TableRow key={col.id}>
                        <TableCell>
                          <div className="font-medium">{col.name}</div>
                          <div className="text-xs text-muted-foreground">{col.short_name || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch checked={enabled} onCheckedChange={(v) => saveCollege(col, { enabled: v })} />
                            <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "开启" : "关闭"}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <ThresholdInput
                            value={typeof cfg.suspect === "number" ? cfg.suspect : DEFAULT_SUSPECT}
                            onCommit={(v) => saveCollege(col, { suspect: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <ThresholdInput
                            value={typeof cfg.fake === "number" ? cfg.fake : DEFAULT_FAKE}
                            onCommit={(v) => saveCollege(col, { fake: v })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 失败队列 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近失败（最多 20 条）</CardTitle>
            <p className="text-sm text-muted-foreground">超过最大重试次数后归档。可点击"重试"手动重新检测单条申请。</p>
          </CardHeader>
          <CardContent>
            {failures.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                暂无失败记录。
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>申请 ID</TableHead>
                    <TableHead className="w-[80px]">尝试</TableHead>
                    <TableHead>错误</TableHead>
                    <TableHead className="w-[160px]">时间</TableHead>
                    <TableHead className="w-[100px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failures.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono text-xs">{f.application_id.slice(0, 8)}…</TableCell>
                      <TableCell>{f.attempts}</TableCell>
                      <TableCell className="max-w-[420px] truncate text-xs text-destructive" title={f.last_error || ""}>
                        {f.last_error || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(f.failed_at).toLocaleString("zh-CN", { hour12: false })}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => retryOne(f.application_id)}>
                          重试
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

const StatCard = ({
  label, value, tone, icon,
}: { label: string; value: number; tone: "muted" | "success" | "warn" | "error"; icon?: React.ReactNode }) => {
  const toneCls =
    tone === "success" ? "text-green-600" :
    tone === "warn" ? "text-amber-600" :
    tone === "error" ? "text-destructive" :
    "text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-3">
        <div className={`flex items-center gap-1.5 text-xs ${toneCls}`}>
          {icon} {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
};

const ThresholdInput = ({ value, onCommit }: { value: number; onCommit: (v: number) => void }) => {
  const [draft, setDraft] = useState(value.toString());
  useEffect(() => { setDraft(value.toString()); }, [value]);
  return (
    <Input
      type="number" step="0.05" min={0} max={1}
      className="h-8 w-24 font-mono text-xs"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft);
        if (!Number.isFinite(n) || n < 0 || n > 1) { setDraft(value.toString()); return; }
        if (Math.abs(n - value) > 1e-6) onCommit(n);
      }}
    />
  );
};

export default AigcAdmin;