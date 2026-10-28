import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { toastError } from "@/lib/errors";
import { displayError } from "@/lib/displayText";

type Result = {
  success?: boolean;
  elapsed_ms?: number;
  deleted_applications?: number;
  deleted_reviews?: number;
  deleted_submission_records?: number;
  deleted_audit_logs?: number;
  deleted_users?: number;
  deleted_orphan_profiles?: number;
  delete_failures_sample?: string[];
  caller_preserved?: string;
  new_admin?: { account: string; email: string; password: string } | null;
  error?: string;
};

export default function PurgeAndBootstrap() {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    if (confirmText !== "PURGE") {
      toast.error('请输入 PURGE 以确认');
      return;
    }
    setLoading(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("admin-purge-and-bootstrap", {
      body: { confirm: "PURGE", create_new_admin: true },
    });
    setLoading(false);
    if (error) {
      const ctx: any = (error as any).context;
      let detail = error.message;
      try {
        const t = await ctx?.text?.();
        if (t) detail = JSON.parse(t).error ?? detail;
      } catch {}
      setResult({ error: displayError(detail) });
      toast.error(displayError(detail));
      return;
    }
    setResult(data as Result);
    toast.success("清理完成，请妥善保存新管理员账号");
  };

  const copyAdmin = async () => {
    if (!result?.new_admin) return;
    const text = `账号：${result.new_admin.account}\n邮箱：${result.new_admin.email}\n密码：${result.new_admin.password}`;
    const ok = await copyText(text);
    if (ok) toast.success("已复制");
    else toast.error("复制失败，请手动选择文本复制");
  };

  return (
    <AppLayout>
      <PageHeader title="重置环境（危险操作）" description="清空业务数据 + 删除所有非管理员账号 + 创建一个随机密码的新管理员" />
      <div className="mx-auto max-w-3xl space-y-4">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>不可恢复</AlertTitle>
          <AlertDescription>
            将永久清空：申请、评审、提交流水、审计日志；删除所有学生与教师账号及其档案；
            创建一个新的 A+8 位数字管理员账号（12 位随机密码）。当前登录的管理员不会被删除。
          </AlertDescription>
        </Alert>

        {!result && (
          <Card>
            <CardHeader>
              <CardTitle>确认执行</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">在下方输入 <span className="font-mono font-semibold">PURGE</span> 解锁按钮：</p>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="输入 PURGE" />
              <Button variant="destructive" disabled={loading || confirmText !== "PURGE"} onClick={run}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                立即执行清理 + 创建新管理员
              </Button>
            </CardContent>
          </Card>
        )}

        {result?.error && (
          <Alert variant="destructive">
            <AlertTitle>失败</AlertTitle>
            <AlertDescription>{displayError(result.error)}</AlertDescription>
          </Alert>
        )}

        {result?.success && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>执行结果</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div>耗时：{((result.elapsed_ms ?? 0) / 1000).toFixed(1)} 秒</div>
                <div>删除申请：{result.deleted_applications}</div>
                <div>删除评审：{result.deleted_reviews}</div>
                <div>删除提交流水：{result.deleted_submission_records}</div>
                <div>删除审计日志：{result.deleted_audit_logs}</div>
                <div>删除用户：{result.deleted_users}（孤儿档案 {result.deleted_orphan_profiles ?? 0}）</div>
                <div>当前登录账号：{result.caller_preserved}（已保留）</div>
                {!!result.delete_failures_sample?.length && (
                  <div className="text-destructive">部分失败示例：{result.delete_failures_sample.map(displayError).join("；")}</div>
                )}
              </CardContent>
            </Card>

            {result.new_admin && (
              <Card className="border-primary">
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>新管理员账号（仅显示一次）</CardTitle>
                  <Button size="sm" variant="outline" onClick={copyAdmin}><Copy className="mr-1 h-4 w-4" />复制</Button>
                </CardHeader>
                <CardContent className="space-y-2 font-mono text-sm">
                  <div>账号：<span className="font-semibold">{result.new_admin.account}</span></div>
                  <div>邮箱：<span className="font-semibold">{result.new_admin.email}</span></div>
                  <div>密码：<span className="font-semibold">{result.new_admin.password}</span></div>
                  <p className="mt-2 text-xs text-muted-foreground">⚠️ 离开本页面后将无法再查看此密码，请立即记录到安全位置。</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}