import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScanFace, AlertTriangle, CheckCircle2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { toastErrorLegacy } from "@/lib/errors";

type Status = "unknown" | "no_face" | "match" | "mismatch" | "error" | null | undefined;

type Props = {
  applicationId: string;
  status: Status;
  score: number | null | undefined;
  note: string | null | undefined;
  checkedAt: string | null | undefined;
  /** 是否对当前用户显示（一般仅教师/管理员）。 */
  visible: boolean;
  /** 调用人脸比对完成后刷新父组件 */
  onRefreshed?: () => void;
};

const META: Record<
  Exclude<Status, null | undefined>,
  { tone: string; label: string; icon: any; hint: string }
> = {
  mismatch: {
    tone: "border-destructive/60 bg-destructive/10 text-destructive",
    label: "人脸不匹配",
    icon: AlertTriangle,
    hint: "材料图片中的人脸与学生证件照差异明显，建议重点核查身份。",
  },
  no_face: {
    tone: "border-muted bg-muted/40 text-muted-foreground",
    label: "材料未检测到人脸",
    icon: ScanFace,
    hint: "材料图中未识别到清晰的人脸（不影响材料有效性）。",
  },
  match: {
    tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    label: "人脸匹配",
    icon: CheckCircle2,
    hint: "材料中的人脸与学生证件照高度一致。",
  },
  unknown: {
    tone: "border-muted bg-muted/30 text-muted-foreground",
    label: "暂未比对",
    icon: ScanFace,
    hint: "尚未进行人脸比对，可手动触发。",
  },
  error: {
    tone: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    label: "比对失败",
    icon: AlertTriangle,
    hint: "人脸比对调用出错，可重试。",
  },
};

export default function FaceMatchAlert({
  applicationId, status, score, note, checkedAt, visible, onRefreshed,
}: Props) {
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!visible) return null;
  const s: Exclude<Status, null | undefined> = (status as any) || "unknown";
  const meta = META[s];
  const Icon = meta.icon;

  const run = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke("face-compare", {
        body: { application_id: applicationId },
      });
      if (error) throw error;
      toast({ title: "已重新比对", description: "结果已更新" });
      onRefreshed?.();
    } catch (e: any) {
      toastErrorLegacy(e, "比对失败");
    } finally {
      setRunning(false);
    }
  };

  // mismatch / error 默认收起，但更显眼；其它默认收起
  return (
    <div className={`rounded-md border px-3 py-2 ${meta.tone}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">人脸核验：{meta.label}</span>
        {typeof score === "number" && s !== "no_face" && s !== "unknown" && (
          <Badge variant="outline" className="bg-background/60">
            相似度 {(score * 100).toFixed(0)}%
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="ml-1 text-xs">{expanded ? "收起" : "查看"}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={run}
            disabled={running}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
            <span className="ml-1 text-xs">{running ? "比对中…" : "重新比对"}</span>
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 space-y-1 border-t border-current/20 pt-2 text-xs">
          <div>{meta.hint}</div>
          {note && <div>AI 说明：{note}</div>}
          {checkedAt && (
            <div className="opacity-70">检测时间：{new Date(checkedAt).toLocaleString("zh-CN", { hour12: false })}</div>
          )}
          <div className="opacity-70">
            提示：人脸比对仅用于辅助参考，<b>不影响材料有效性判定</b>。
          </div>
        </div>
      )}
    </div>
  );
}