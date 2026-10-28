import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toPlainText } from "@/lib/sanitizeMarkdown";
import { displayReason } from "@/lib/displayText";

export type AiVerdict = {
  status: string;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  ai_suggested_credit: number | null;
  ai_check_consistency: boolean | null;
  ai_check_relevance: boolean | null;
  ai_check_authenticity: boolean | null;
  ai_check_name_match: boolean | null;
  ai_check_identity_match: boolean | null;
  ai_check_logic: boolean | null;
  ai_check_completeness: boolean | null;
  ai_identity_mismatch: string | null;
  ai_logic_issue: string | null;
  ai_blank_fields: string | null;
  ai_detected_student_no: string | null;
  ai_detected_school: string | null;
  ai_detected_project: string | null;
  ai_detected_achievement: string | null;
  ai_detected_level: string | null;
  ai_detected_identity: string | null;
  ai_override_note: string | null;
  review_source?: string | null;
};

/** 学生申诉触发的人工复核：不显示 AI 置信度（避免误导）；其余按状态分级展示。 */
export function ConfidenceBadge({
  status,
  confidence,
  reviewSource,
}: {
  status: string;
  confidence: number | null;
  reviewSource?: string | null;
}) {
  const tip = "判定确信度 = AI / 系统对最终判定结果（通过 / 驳回 / 需复核）的把握程度，不是材料本身的真实性概率。例如「驳回 90%」= 90% 确定该驳回。";
  if (reviewSource === "student_appeal") {
    return (
      <Badge variant="outline" className="bg-warning/15 text-warning border-transparent" title={tip}>
        学生申诉，无判定确信度
      </Badge>
    );
  }
  if (confidence == null) {
    return <Badge variant="outline" className="text-muted-foreground" title={tip}>判定确信度 —</Badge>;
  }
  const pct = `${(Number(confidence) * 100).toFixed(0)}%`;
  if (status === "auto_approved") {
    return (
      <Badge variant="outline" className="bg-success/15 text-success border-transparent" title={tip}>
        系统强通过（确信度 {pct}）
      </Badge>
    );
  }
  if (status === "rejected_by_ai") {
    return (
      <Badge variant="outline" className="bg-danger/15 text-danger border-transparent" title={tip}>
        系统强驳回（确信度 {pct}）
      </Badge>
    );
  }
  if (status === "pending_review") {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent" title={tip}>
        系统不确定，转人工（确信度 {pct}）
      </Badge>
    );
  }
  return <Badge variant="outline" title={tip}>判定确信度 {pct}</Badge>;
}

function CheckRow({
  ok,
  label,
  okText,
  failText,
  unknownText,
}: {
  ok: boolean | null;
  label: string;
  okText: string;
  failText: string;
  unknownText: string;
}) {
  let Icon = MinusCircle;
  let color = "text-muted-foreground";
  let text = unknownText;
  if (ok === true) { Icon = CheckCircle2; color = "text-success"; text = okText; }
  else if (ok === false) { Icon = XCircle; color = "text-danger"; text = failText; }
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
      <div className="flex-1 text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="ml-2 text-muted-foreground">{text}</span>
      </div>
    </div>
  );
}

export function AiVerdictCard({ app }: { app: AiVerdict }) {
  const dash = "未识别";
  const detectedShown =
    app.ai_detected_project ||
    app.ai_detected_achievement ||
    app.ai_detected_level ||
    app.ai_detected_identity ||
    app.ai_detected_student_no ||
    app.ai_detected_school;

  return (
    <Card className={app.status === "rejected_by_ai" ? "border-destructive" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">系统核验结果</CardTitle>
            <CardDescription className="mt-1">
              建议学分：{app.ai_suggested_credit ?? "—"}
            </CardDescription>
          </div>
          <ConfidenceBadge
            status={app.status}
            confidence={app.ai_confidence}
            reviewSource={app.review_source}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">四项核验</div>
          <div className="rounded border bg-muted/30 p-3">
            <CheckRow
              ok={app.ai_check_consistency}
              label="材料一致性"
              okText="证书内容与所选关键词的项目、级别、身份均一致"
              failText="证书内容与所选关键词不一致（项目 / 级别 / 身份其一不符）"
              unknownText="未给出判断"
            />
            <CheckRow
              ok={app.ai_check_relevance}
              label="图片相关性"
              okText="图片与申请主题相关"
              failText="图片与申请主题无关"
              unknownText="未给出判断"
            />
            <CheckRow
              ok={app.ai_check_authenticity}
              label="真实性"
              okText="未发现明显篡改、拼接或 AI 生成痕迹"
              failText="发现可疑的篡改 / 拼接 / AI 生成痕迹"
              unknownText="未给出判断"
            />
            <CheckRow
              ok={app.ai_check_name_match}
              label="姓名匹配"
              okText="证书中姓名与申请人一致"
              failText="证书中姓名与申请人不一致"
              unknownText="证书中未出现姓名信息，无法判断"
            />
            <CheckRow
              ok={app.ai_check_identity_match}
              label="身份信息一致性"
              okText="材料中的学号 / 院系 / 班级 / 身份证 / 学校均与账号一致"
              failText={displayReason(app.ai_identity_mismatch) || "材料中的身份信息与账号不符"}
              unknownText="材料未包含可核验的身份信息"
            />
            <CheckRow
              ok={app.ai_check_logic}
              label="逻辑合理性"
              okText="未发现常识性 / 数值 / 时间逻辑错误"
              failText={displayReason(app.ai_logic_issue) || "材料存在逻辑性错误"}
              unknownText="未给出判断"
            />
            <CheckRow
              ok={app.ai_check_completeness}
              label="材料完整性"
              okText="关键字段（学校 / 院系 / 班级 / 姓名 / 学号 等）均已填写"
              failText={app.ai_blank_fields ? `存在空白未填写字段：${displayReason(app.ai_blank_fields)}` : "材料存在空白未填写字段"}
              unknownText="未给出判断"
            />
          </div>
        </div>

        {detectedShown && (
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">图片实际识别</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border bg-muted/30 p-3 text-sm">
              <div><span className="text-muted-foreground">项目大类：</span>{app.ai_detected_project || dash}</div>
              <div><span className="text-muted-foreground">成果细类：</span>{app.ai_detected_achievement || dash}</div>
              <div><span className="text-muted-foreground">级别：</span>{app.ai_detected_level || dash}</div>
              <div><span className="text-muted-foreground">身份：</span>{app.ai_detected_identity || dash}</div>
              <div><span className="text-muted-foreground">学号：</span>{app.ai_detected_student_no || dash}</div>
              <div><span className="text-muted-foreground">学校：</span>{app.ai_detected_school || dash}</div>
            </div>
          </div>
        )}

        {app.ai_override_note && (
          <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <div className="font-medium text-warning">系统强制改判</div>
              <div className="mt-1 text-foreground">{displayReason(app.ai_override_note)}</div>
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">详细理由</div>
          <p className="whitespace-pre-wrap rounded bg-muted/50 p-3 text-sm leading-relaxed">
            {app.ai_reasoning ? displayReason(app.ai_reasoning) : "系统未给出详细理由。"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** 顶部小徽章：区分本次人工复核的来源 */
export function ReviewSourceBadge({ source }: { source: string | null | undefined }) {
  if (source === "ai_uncertain") {
    return (
      <Badge variant="outline" className="bg-warning/15 text-warning border-transparent">
        AI 转人工
      </Badge>
    );
  }
  if (source === "student_appeal") {
    return (
      <Badge variant="outline" className="bg-orange-500/15 text-orange-600 border-transparent">
        学生申诉
      </Badge>
    );
  }
  if (source === "reviewer_recall") {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">
        教师召回
      </Badge>
    );
  }
  return null;
}