import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Status = "pending" | "real" | "suspect" | "fake" | "skipped" | "error" | null | undefined;

type Props = {
  status: Status;
  score?: number | null;
  checkedAt?: string | null;
  detailHref?: string;
  compact?: boolean;
  className?: string;
};

/**
 * 学生侧 AI 生图警示横幅。
 * 仅在 status 为 fake / suspect 时渲染；其他状态返回 null。
 * 风格：单一字体，仅通过字号/字重/颜色构建层级，使用语义 token。
 */
export default function StudentAigcWarning({
  status, score, checkedAt, detailHref, compact, className,
}: Props) {
  if (status !== "fake" && status !== "suspect") return null;
  const isFake = status === "fake";
  const tone = isFake
    ? "border-l-destructive bg-destructive/10 text-destructive"
    : "border-l-warning bg-warning/10 text-warning";
  const title = isFake ? "材料图片疑似 AI 生成" : "材料图片存在 AI 生成嫌疑";
  const body = isFake
    ? "本次提交的图片经系统鉴别为 AI 生成图像，已自动驳回。请使用真实拍摄的材料重新提交，如有疑问可联系所在学院核实。"
    : "本次提交的图片存在 AI 生成迹象，已转人工复核。请确保提交材料真实有效，必要时准备好原件以备核查。";
  const pct = typeof score === "number" ? (score * 100).toFixed(1) : null;

  if (compact) {
    return (
      <div className={cn("rounded-md border-l-4 px-3 py-2 text-sm", tone, className)}>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span className="font-medium">{title}</span>
          {pct && <span className="text-xs opacity-80">· AI 生成概率 {pct}%</span>}
          {detailHref && (
            <Link to={detailHref} className="ml-auto text-xs underline-offset-2 hover:underline">
              查看详情 ›
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border-l-4 px-4 py-3", tone, className)}>
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold">{title}</div>
          <div className="mt-1 text-sm text-foreground/80">{body}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs opacity-80">
            {pct && <span>AI 生成概率 {pct}%</span>}
            {checkedAt && <span>检测时间 {new Date(checkedAt).toLocaleString("zh-CN", { hour12: false })}</span>}
            {detailHref && (
              <Link to={detailHref} className="ml-auto underline-offset-2 hover:underline">
                查看详情 ›
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}