import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, ShieldCheck, ShieldQuestion, RefreshCw, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { toastErrorLegacy } from "@/lib/errors";

type Status = "pending" | "real" | "suspect" | "fake" | "skipped" | "error" | null | undefined;

type Props = {
  applicationId: string;
  status: Status;
  score: number | null | undefined;
  detail: any;
  checkedAt: string | null | undefined;
  /** 仅教师/管理员可见。 */
  visible: boolean;
  onRefreshed?: () => void;
};

const META: Record<Exclude<Status, null | undefined>, { tone: string; label: string; icon: any; hint: string }> = {
  fake: {
    tone: "border-destructive/60 bg-destructive/10 text-destructive",
    label: "疑似 AI 生成图（高风险）",
    icon: ShieldAlert,
    hint: "鉴别引擎判定该图大概率为 AI 模型生成。系统已自动驳回，可在下方查看疑似来源。",
  },
  suspect: {
    tone: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    label: "存在 AI 生成嫌疑",
    icon: ShieldAlert,
    hint: "材料图存在 AI 生成迹象，已强制转人工复核。请重点核查证书原件。",
  },
  real: {
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    label: "判定为真实拍摄",
    icon: ShieldCheck,
    hint: "鉴别引擎未发现明显的 AI 生成痕迹。",
  },
  pending: {
    tone: "border-muted bg-muted/30 text-muted-foreground",
    label: "待鉴别",
    icon: ShieldQuestion,
    hint: "尚未进行 AI 生图鉴别，可手动触发。",
  },
  skipped: {
    tone: "border-muted bg-muted/30 text-muted-foreground",
    label: "无需鉴别",
    icon: ShieldQuestion,
    hint: "附件不是图片格式或检测已被关闭。",
  },
  error: {
    tone: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    label: "鉴别失败",
    icon: ShieldAlert,
    hint: "调用阿里云鉴别接口出错，可重试。",
  },
};

export default function AigcDetectAlert({
  applicationId, status, score, detail, checkedAt, visible, onRefreshed,
}: Props) {
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;
  const s: Exclude<Status, null | undefined> = (status as any) || "pending";
  const meta = META[s] ?? META.pending;
  const Icon = meta.icon;
  const pct = typeof score === "number" ? (score * 100).toFixed(1) : null;
  const suspected: { name: string; score: number }[] = Array.isArray(detail?.suspected_models) ? detail.suspected_models : [];

  const run = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("aigc-detect", {
        body: { application_id: applicationId },
      });
      if (error) throw error;
      toast({ title: "已重新鉴别", description: "结果已更新" });
      onRefreshed?.();
    } catch (e: any) {
      toastErrorLegacy(e, "鉴别失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={`rounded-md border px-3 py-2 ${meta.tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">AI 生图鉴别：{meta.label}</span>
        {pct && s !== "pending" && s !== "skipped" && (
          <Badge variant="outline" className="bg-background/60">AI 生成概率 {pct}%</Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setExpanded((v) => !v)}>
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="ml-1 text-xs">{expanded ? "收起" : "查看"}</span>
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={run} disabled={running}>
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            <span className="ml-1 text-xs">{running ? "鉴别中…" : "重新鉴别"}</span>
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-current/20 pt-2 text-xs">
          <div>{meta.hint}</div>
          {suspected.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              <span>疑似来源：</span>
              {suspected.slice(0, 5).map((m, i) => (
                <Badge key={i} variant="outline" className="bg-background/60">
                  {m.name} {(m.score * 100).toFixed(0)}%
                </Badge>
              ))}
            </div>
          )}
          {detail?.request_id && <div className="opacity-70 break-all">调用编号：{String(detail.request_id)}</div>}
          {detail?.provider && <div className="opacity-70">检测服务：阿里云图片鉴别</div>}
          {detail?.region && (
            <div className="opacity-70">
              区域：{detail.region === "cn-shanghai" ? "上海" : detail.region === "cn-beijing" ? "北京" : "其他服务区域"} · {" "}
              <a
                href="https://yundun.console.aliyun.com/?p=cts#/imageaudit/dashboard?regionId=cn-shanghai"
                target="_blank" rel="noreferrer"
                className="underline hover:opacity-100"
              >
                在阿里云控制台查询调用记录
              </a>
            </div>
          )}
          {checkedAt && <div className="opacity-70">检测时间：{new Date(checkedAt).toLocaleString("zh-CN", { hour12: false })}</div>}
        </div>
      )}
    </div>
  );
}