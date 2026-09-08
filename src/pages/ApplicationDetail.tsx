import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimeTable } from "@/hooks/useRealtimeTable";
import { useSerializedReload } from "@/hooks/useSerializedReload";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { AiVerdictCard, ReviewSourceBadge } from "@/components/AiVerdictCard";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X, FileDown, ImageIcon, RefreshCw, Undo2, AlertTriangle, Award, ZoomIn } from "lucide-react";
import ZoomableImage from "@/components/ZoomableImage";
import { normalizeKeyword } from "@/lib/keywords";
import { toPlainText } from "@/lib/sanitizeMarkdown";
import { formatDepositDate, EMPTY_PLACEHOLDER } from "@/lib/utils";
import CertificatePreview, { CertificateData } from "@/components/CertificatePreview";
import { exportElementToPdf, makeQrDataUrl, urlToDataUrl } from "@/lib/certificate";
import FaceMatchAlert from "@/components/FaceMatchAlert";
import AigcDetectAlert from "@/components/AigcDetectAlert";
import StudentAigcWarning from "@/components/StudentAigcWarning";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toastErrorLegacy } from "@/lib/errors";
import AttachmentsGallery from "@/components/AttachmentsGallery";
import FormFilePreview from "@/components/FormFilePreview";
import { deserializeItems } from "@/lib/parseForm";
import { COMPLIANCE_LABEL } from "@/lib/creditStandard";

// 把后端/Supabase 的英文错误信息翻译成简体中文，避免 RLS / JWT 等英文消息直接弹给用户
function friendlyError(err: any): string {
  const msg = (err?.message || String(err || "")).toLowerCase();
  if (msg.includes("row-level security") || msg.includes("permission denied") || msg.includes("not authorized")) {
    return "当前申请已结案或你无权发起此操作";
  }
  if (msg.includes("jwt") || msg.includes("expired") || msg.includes("invalid token")) {
    return "登录已过期，请重新登录";
  }
  if (msg.includes("duplicate key") || msg.includes("uniq_review_dedup")) {
    return "请勿重复提交相同的复核结果";
  }
  if (msg.includes("network") || msg.includes("failed to fetch")) {
    return "网络异常，请稍后再试";
  }
  return err?.message || "操作失败";
}

type App = {
  id: string;
  student_id: string;
  description: string;
  selected_keywords: string[];
  custom_keywords: string[];
  file_path: string | null;
  status: any;
  ai_matched_rule_id: string | null;
  ai_suggested_credit: number | null;
  ai_confidence: number | null;
  ai_reasoning: string | null;
  ai_reasoning_short: string | null;
  final_credit: number | null;
  final_review_note: string | null;
  submitted_at: string;
  review_source?: string | null;
  ai_check_consistency?: boolean | null;
  ai_check_relevance?: boolean | null;
  ai_check_authenticity?: boolean | null;
  ai_check_name_match?: boolean | null;
  ai_detected_project?: string | null;
  ai_detected_achievement?: string | null;
  ai_detected_level?: string | null;
  ai_detected_identity?: string | null;
  ai_override_note?: string | null;
  certificate_no?: string | null;
  certificate_issued_at?: string | null;
  face_match_status?: "unknown" | "no_face" | "match" | "mismatch" | "error" | null;
  face_match_score?: number | null;
  face_match_note?: string | null;
  face_checked_at?: string | null;
  aigc_status?: "pending" | "real" | "suspect" | "fake" | "skipped" | "error" | null;
  aigc_score?: number | null;
  aigc_detail?: any;
  aigc_checked_at?: string | null;
  item_category?: string | null;
  item_project?: string | null;
  achievement_name?: string | null;
  level_name?: string | null;
  self_rank?: string | null;
  claimed_credit?: number | null;
  form_file_path?: string | null;
  credit_standard?: number | null;
  credit_compliance?: "ok" | "over" | "under" | "unknown" | null;
};
type Review = {
  id: string; action: string; decision: string; credit: number | null;
  confidence: number | null; note: string | null; created_at: string;
};
type KeywordRef = {
  id: string;
  keyword: string;
  category: string | null;
  source: string | null;
  usage_count: number;
  created_at: string;
};

const ApplicationDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const [app, setApp] = useState<App | null>(null);
  const [student, setStudent] = useState<{
    full_name: string | null; student_no: string | null; email: string | null;
    department?: string | null; major?: string | null; id_card?: string | null;
    school?: string | null; photo_url?: string | null;
  } | null>(null);
  const [matchedRule, setMatchedRule] = useState<{ name: string; credit: number } | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [credit, setCredit] = useState<number>(0);
  const [note, setNote] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [libraryRefs, setLibraryRefs] = useState<KeywordRef[]>([]);
  const [exporting, setExporting] = useState(false);
  const [certData, setCertData] = useState<CertificateData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">("landscape");
  const [preparing, setPreparing] = useState(false);
  const [materialPreviewOpen, setMaterialPreviewOpen] = useState(false);
  const formItems = app ? deserializeItems(app.description) : [];
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: a } = await supabase.from("applications").select("*").eq("id", id).single();
    if (!a) return;
    setApp(a as App);
    setCredit(Number((a as App).final_credit ?? (a as App).claimed_credit ?? (a as App).ai_suggested_credit ?? 0));
    const [s, r, rv] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, student_no, email, department, major, id_card, school, photo_url")
        .eq("user_id", (a as App).student_id)
        .single(),
      (a as App).ai_matched_rule_id
        ? supabase.from("rules").select("name, credit").eq("id", (a as App).ai_matched_rule_id).single()
        : Promise.resolve({ data: null }),
      supabase.from("application_reviews").select("*").eq("application_id", id).order("created_at"),
    ]);
    setStudent(s.data as any);
    setMatchedRule(r.data as any);
    setReviews((rv.data as Review[]) ?? []);

    if ((a as App).file_path) {
      const { data: signed } = await supabase.storage
        .from("application-files")
        .createSignedUrl((a as App).file_path!, 3600);
      setFileUrl(signed?.signedUrl ?? null);
    }

    // 加载关键词库中与本申请相关的条目（学生选择 + 自定义关键词命中），用于复核者确认可靠性
    const allKw = Array.from(new Set([
      ...((a as App).selected_keywords ?? []),
      ...((a as App).custom_keywords ?? []),
    ].map((k) => k.trim()).filter(Boolean)));
    if (allKw.length > 0) {
      const { data: kwData } = await supabase
        .from("keywords")
        .select("id, keyword, category, source, usage_count, created_at")
        .in("keyword", allKw);
      setLibraryRefs((kwData as KeywordRef[]) ?? []);
    } else {
      setLibraryRefs([]);
    }
  }, [id]);
  const reload = useSerializedReload(load);
  useEffect(() => { reload(); }, [reload, load]);
  useRealtimeTable("applications", reload, { filter: id ? `id=eq.${id}` : undefined });
  useRealtimeTable("application_reviews", reload, { filter: id ? `application_id=eq.${id}` : undefined });

  const isReviewer = !!app && (hasRole("admin") || hasRole("teacher") || hasRole("super_admin"));

  // 已发生的人工复核次数（teacher_review / admin_review）
  const manualReviewCount = reviews.filter(
    (r) => r.action === "teacher_review" || r.action === "admin_review",
  ).length;
  // 当 status=pending_review 且已存在 ≥1 次人工复核 → 标注"第 N 次人工复核"
  const isReReview =
    !!app &&
    app.status === "pending_review" &&
    manualReviewCount >= 1;
  const reReviewIndex = manualReviewCount + 1;

  const displayFinalCredit = (s: any, c: number | null) =>
    s === "rejected" || s === "rejected_by_ai" ? 0 : c;

  const studentShortReason =
    app?.ai_reasoning_short?.trim() ||
    (app?.ai_reasoning ? app.ai_reasoning.slice(0, 60) + (app.ai_reasoning.length > 60 ? "…" : "") : "");

  const decide = async (decision: "approved" | "rejected") => {
    if (!app) return;
    if (submitting) return;
    if (decision === "approved" && (!credit || credit <= 0)) {
      return toast({ title: "请填写最终学分", variant: "destructive" });
    }
    setSubmitting(true);
    try {
    // 幂等校验：若该申请已被本人在 30 秒内处理过，禁止重复写入
    const { data: cur } = await supabase
      .from("applications")
      .select("status, final_reviewer_id, reviewed_at")
      .eq("id", app.id)
      .single();
    if (cur && (cur.status === "approved" || cur.status === "rejected")) {
      const recent =
        cur.reviewed_at && Date.now() - new Date(cur.reviewed_at).getTime() < 30_000;
      if (cur.final_reviewer_id === user?.id && recent) {
        toast({ title: "已处理，无需重复操作" });
        return;
      }
    }
    const action = hasRole("admin") ? "admin_review" : "teacher_review";
    const wasRejectedByAi = app.status === "rejected_by_ai";
    const hasCustom = (app.custom_keywords?.length ?? 0) > 0;

    const { error: re } = await supabase.from("application_reviews").insert({
      application_id: app.id,
      reviewer_id: user!.id,
      action,
      decision,
      credit: decision === "approved" ? credit : null,
      note: note.trim() || null,
    });
    if (re) return toastErrorLegacy(re, "保存失败");

    const { error: ue } = await supabase
      .from("applications")
      .update({
        status: decision,
        final_credit: decision === "approved" ? credit : null,
        final_reviewer_id: user!.id,
        final_review_note: note.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", app.id);
    if (ue) return toastErrorLegacy(ue, "更新失败");

    // 人工通过时：检查该关键词组合是否已有完全匹配的规则或案例，没有则沉淀到案例库
    if (decision === "approved") {
      const allKw = [...(app.selected_keywords ?? []), ...(app.custom_keywords ?? [])];
      const kwSet = allKw.filter(Boolean).sort().join("|");

      // 检查是否已有规则完全匹配这组关键词
      const { data: existingRules } = await supabase
        .from("rules")
        .select("id, project, achievement, level, identity")
        .eq("active", true);
      const ruleMatch = (existingRules ?? []).some((r) => {
        const dims = [r.project, r.achievement, r.level, r.identity].filter(Boolean).sort().join("|");
        return dims === kwSet;
      });

      // 检查是否已有案例包含完全相同的关键词
      const { data: existingCases } = await supabase
        .from("cases")
        .select("summary")
        .limit(200);
      const caseMatch = (existingCases ?? []).some((c) =>
        allKw.every((kw) => kw && c.summary.includes(kw))
      );

      if (!ruleMatch && !caseMatch) {
        const title = (app.custom_keywords?.[0] ?? allKw[0] ?? app.description).slice(0, 60);
        const summary = `关键词：${allKw.join("、")}\n申请说明：${app.description.slice(0, 300)}`;
        const { error: ce } = await supabase.from("cases").insert({
          title,
          summary,
          rule_id: app.ai_matched_rule_id,
          awarded_credit: credit,
          notes: `人工复核通过沉淀。复核备注：${note.trim() || "（无）"}`,
          created_by: user!.id,
          college_id: (app as any).college_id ?? null,
        });
        if (!ce) toast({ title: "已通过", description: "新案例已加入案例库，学生端可搜索使用" });
        else toast({ title: "已通过" });
      } else {
        toast({ title: "已通过" });
      }

      // 自定义关键词沉淀到关键词库（已存在则累加使用次数，新词自动入库）
      // 输入端按规范化形式去重（避免「ACM」「acm 」「ＡＣＭ」重复落库）
      const customRaw = (app.custom_keywords ?? [])
        .map((k) => k.trim())
        .filter((k) => k && k.length <= 64);
      const seenNorm = new Set<string>();
      const customKws: string[] = [];
      for (const k of customRaw) {
        const n = normalizeKeyword(k);
        if (!n || seenNorm.has(n)) continue;
        seenNorm.add(n);
        customKws.push(k);
      }
      if (customKws.length > 0) {
        // 拉取库内全部关键词，按规范化形式比对（DB 唯一约束基于原文，无法覆盖大小写/空格差异）
        const { data: allLib } = await supabase
          .from("keywords")
          .select("id, keyword, usage_count");
        const libByNorm = new Map<string, { id: string; keyword: string; usage_count: number }>();
        for (const r of (allLib ?? []) as any[]) {
          libByNorm.set(normalizeKeyword(r.keyword), r);
        }
        const toInsert: Array<{
          keyword: string;
          category: string;
          source: string;
          usage_count: number;
          created_by: string;
          college_id: string | null;
        }> = [];
        const toBump: typeof libByNorm extends Map<string, infer V> ? V[] : never = [] as any;
        for (const k of customKws) {
          const hit = libByNorm.get(normalizeKeyword(k));
          if (hit) {
            toBump.push(hit);
          } else {
            toInsert.push({
              keyword: k,
              category: "学生申请沉淀",
              source: `人工复核通过 · ${new Date().toISOString().slice(0, 10)}`,
              usage_count: 1,
              created_by: user!.id,
              college_id: (app as any).college_id ?? null,
            });
          }
        }
        if (toInsert.length > 0) {
          await supabase.from("keywords").insert(toInsert);
        }
        await Promise.all(
          toBump.map((k) =>
            supabase
              .from("keywords")
              .update({ usage_count: (k.usage_count ?? 0) + 1 })
              .eq("id", k.id),
          ),
        );
      }
    } else {
      toast({ title: "已驳回" });
    }
    load();
    } finally {
      setSubmitting(false);
    }
  };

  const requestManualReview = async () => {
    if (!app) return;
    if (submitting) return;
    setSubmitting(true);
    try {
    const { data, error } = await supabase
      .from("applications")
      .update({ status: "pending_review", review_source: "student_appeal" })
      .eq("id", app.id)
      .select("id, status");
    if (error) return toastErrorLegacy(error, "申请失败");
    if (!data || data.length === 0) {
      return toast({
        title: "申请未生效",
        description: "可能没有权限发起复核，请联系管理员",
        variant: "destructive",
      });
    }
    toast({ title: "已转人工复核", description: "教师将尽快处理" });
    load();
    } finally {
      setSubmitting(false);
    }
  };

  const [retrying, setRetrying] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  const retryAiEvaluation = async () => {
    if (!app) return;
    setRetrying(true);
    try {
      // 重新触发前先把 status 复位到 pending_ai，便于学生与教师在列表中识别
      await supabase
        .from("applications")
        .update({ status: "pending_ai", ai_last_error: null })
        .eq("id", app.id);
      const { data, error } = await supabase.functions.invoke("evaluate-application", {
        body: { application_id: app.id },
      });
      if (error || (data as any)?.error) {
        toast({
          title: "重试失败",
          description: (data as any)?.error || error?.message || "请稍后再试",
          variant: "destructive",
        });
      } else {
        toast({ title: "已完成新一轮 AI 审核" });
      }
    } catch (e: any) {
      toastErrorLegacy(e, "重试失败");
    } finally {
      setRetrying(false);
      load();
    }
  };

  const rollbackAiSnapshot = async () => {
    if (!app) return;
    const snap = (app as any).ai_previous_snapshot;
    if (!snap || typeof snap !== "object") {
      return toast({ title: "没有可回滚的历史结果", variant: "destructive" });
    }
    setRollingBack(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({
          status: snap.status ?? "pending_review",
          ai_confidence: snap.ai_confidence ?? null,
          ai_reasoning: snap.ai_reasoning ?? null,
          ai_reasoning_short: snap.ai_reasoning_short ?? null,
          ai_suggested_credit: snap.ai_suggested_credit ?? null,
          ai_check_consistency: snap.ai_check_consistency ?? null,
          ai_check_relevance: snap.ai_check_relevance ?? null,
          ai_check_authenticity: snap.ai_check_authenticity ?? null,
          ai_check_name_match: snap.ai_check_name_match ?? null,
          ai_check_identity_match: snap.ai_check_identity_match ?? null,
          ai_check_logic: snap.ai_check_logic ?? null,
          ai_check_completeness: snap.ai_check_completeness ?? null,
          ai_identity_mismatch: snap.ai_identity_mismatch ?? null,
          ai_logic_issue: snap.ai_logic_issue ?? null,
          ai_blank_fields: snap.ai_blank_fields ?? null,
          ai_detected_project: snap.ai_detected_project ?? null,
          ai_detected_achievement: snap.ai_detected_achievement ?? null,
          ai_detected_level: snap.ai_detected_level ?? null,
          ai_detected_identity: snap.ai_detected_identity ?? null,
          ai_detected_student_no: snap.ai_detected_student_no ?? null,
          ai_detected_school: snap.ai_detected_school ?? null,
          ai_override_note: snap.ai_override_note ?? null,
          review_source: snap.review_source ?? null,
          ai_previous_snapshot: null,
          ai_last_error: null,
        })
        .eq("id", app.id);
      if (error) throw error;
      toast({
        title: "已回滚到上一轮 AI 结果",
        description: snap.taken_at ? `备份时间：${new Date(snap.taken_at).toLocaleString("zh-CN", { hour12: false })}` : undefined,
      });
    } catch (e: any) {
      toastErrorLegacy(e, "回滚失败");
    } finally {
      setRollingBack(false);
      load();
    }
  };

  if (!app) return <AppLayout><p>加载中…</p></AppLayout>;

  const isApproved = app.status === "approved" || app.status === "auto_approved";
  const canExportCert =
    isApproved && (app.student_id === user?.id || hasRole("teacher") || hasRole("admin"));

  const openCertificatePreview = async () => {
    if (!app || !student) return;
    if (!student.full_name || !student.student_no) {
      return toast({
        title: "学生档案不完整",
        description: "请先在「我的档案」中补全姓名和学号",
        variant: "destructive",
      });
    }
    setPreparing(true);
    try {
      const { data: certNo, error: ge } = await supabase.rpc("gen_certificate_no", { _app_id: app.id });
      if (ge || !certNo) throw new Error(ge?.message ?? "证书编号生成失败");

      let photoDataUrl: string | null = null;
      if (student.photo_url) {
        const { data: signed } = await supabase.storage
          .from("application-files")
          .createSignedUrl(student.photo_url, 3600);
        if (signed?.signedUrl) photoDataUrl = await urlToDataUrl(signed.signedUrl);
      }

      const verifyUrl = `${window.location.origin}/verify/${certNo}`;
      const qrDataUrl = await makeQrDataUrl(verifyUrl);

      const projectTitle =
        (app.custom_keywords?.[0]) ||
        (app.selected_keywords?.[0]) ||
        app.ai_detected_project ||
        app.ai_detected_achievement ||
        (app.description || "").slice(0, 24) ||
        "—";

      setCertData({
        school: student.school || "长春财经学院",
        studentName: student.full_name!,
        studentNo: student.student_no!,
        department: student.department || "—",
        major: student.major || null,
        idCard: student.id_card || null,
        photoDataUrl,
        certificateNo: String(certNo),
        credit: Number(app.final_credit ?? app.ai_suggested_credit ?? 0),
        projectTitle,
        description: app.description || "",
        reviewerName: null,
        issuedAt: new Date().toISOString(),
        qrDataUrl,
      });
      setPreviewOpen(true);
      load();
    } catch (e: any) {
      toastErrorLegacy(e, "准备失败");
    } finally {
      setPreparing(false);
    }
  };

  const downloadCertificate = async () => {
    if (!certData || !student) return;
    setExporting(true);
    try {
      // 等待离屏节点渲染（orientation 切换时尺寸会变）
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 50));
      const node = document.getElementById("__cert_render__") as HTMLDivElement | null;
      if (!node) throw new Error("证书渲染失败");
      const tag = orientation === "portrait" ? "竖版" : "横版";
      await exportElementToPdf(
        node,
        `学分认定证明_${student.student_no}_${certData.certificateNo}_${tag}.pdf`,
        orientation,
      );
      toast({ title: "证明已导出", description: `证书编号：${certData.certificateNo}` });
      setPreviewOpen(false);
    } catch (e: any) {
      toastErrorLegacy(e, "导出失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft /></Button>
          <h1 className="text-2xl font-bold">申请详情</h1>
          <StatusBadge status={app.status} audience={isReviewer ? "staff" : "student"} />
          {isReviewer && app.status === "pending_review" && (
            <ReviewSourceBadge source={app.review_source ?? null} />
          )}
          {isReviewer && isReReview && (
            <Badge variant="destructive" className="ml-1">
              ⚠ 第 {reReviewIndex} 次人工复核（学生再次申诉）
            </Badge>
          )}
          {canExportCert && (
            <Button
              size="sm"
              variant="default"
              className="ml-auto"
              onClick={openCertificatePreview}
              disabled={preparing || exporting}
            >
              <Award className="mr-1 h-4 w-4" />
              {preparing ? "准备预览…" : (app.certificate_no ? "重新导出学分证明" : "导出学分证明")}
            </Button>
          )}
        </div>
        {app.certificate_no && (
          <div className="text-xs text-muted-foreground">
            证书编号：<span className="font-mono">{app.certificate_no}</span>
            {app.certificate_issued_at && <> · 首次签发：{new Date(app.certificate_issued_at).toLocaleString("zh-CN", { hour12: false })}</>}
          </div>
        )}

        <AigcDetectAlert
          applicationId={app.id}
          status={app.aigc_status}
          score={app.aigc_score ?? null}
          detail={app.aigc_detail ?? null}
          checkedAt={app.aigc_checked_at ?? null}
          visible={isReviewer}
          onRefreshed={load}
        />

        {!isReviewer && app.student_id === user?.id && (
          <StudentAigcWarning
            status={app.aigc_status}
            score={app.aigc_score ?? null}
            checkedAt={app.aigc_checked_at ?? null}
          />
        )}

        <FaceMatchAlert
          applicationId={app.id}
          status={app.face_match_status}
          score={app.face_match_score ?? null}
          note={app.face_match_note ?? null}
          checkedAt={app.face_checked_at ?? null}
          visible={isReviewer && !!student?.photo_url}
          onRefreshed={load}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本信息</CardTitle>
            {matchedRule && isReviewer && <CardDescription>匹配规则：{matchedRule.name}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div><span className="text-muted-foreground">学生：</span>{student?.full_name} · {student?.student_no} · {student?.email}</div>
            <div><span className="text-muted-foreground">提交时间：</span>{new Date(app.submitted_at).toLocaleString("zh-CN", { hour12: false })}</div>
            <Separator />
            {formItems.length === 0 && (
              <div>
                <div className="mb-1 text-muted-foreground">申请说明</div>
                <p className="whitespace-pre-wrap rounded bg-muted/50 p-3">{app.description}</p>
              </div>
            )}

            {app.selected_keywords.length > 0 && (
              <div>
                <div className="mb-1 text-muted-foreground">学生选择的关键词</div>
                <div className="flex flex-wrap gap-1">
                  {app.selected_keywords.map((k) => <Badge key={k} variant="secondary">{k}</Badge>)}
                </div>
              </div>
            )}
            {app.custom_keywords && app.custom_keywords.length > 0 && (
              <div>
                <div className="mb-1 text-muted-foreground">学生自定义关键词</div>
                <div className="flex flex-wrap gap-1">
                  {app.custom_keywords.map((k) => <Badge key={k} variant="outline">{k}</Badge>)}
                </div>
              </div>
            )}
              {/* 填表流程：申请表条目 + 学分合规 */}
              {formItems.length > 0 && (
                <div className="space-y-2">
                  <div className="text-muted-foreground flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" /> 申请表条目（{formItems.length} 条）
                  </div>
                  <div className="space-y-1.5">
                    {formItems.map((it, idx) => (
                      <div key={idx} className="rounded border bg-muted/30 p-2 text-xs">
                        <div className="font-medium">
                          {idx + 1}. {it.achievement || EMPTY_PLACEHOLDER}
                          {it.level ? `（${it.level}）` : ""}
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          {it.category || EMPTY_PLACEHOLDER} / {it.project || EMPTY_PLACEHOLDER}
                          {it.rank ? ` · ${it.rank}` : ""}
                          {it.credit != null ? ` · 自报 ${it.credit} 分` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {app.claimed_credit != null && (
                      <Badge variant="secondary">自报合计 {app.claimed_credit} 分</Badge>
                    )}
                    {app.credit_standard != null && (
                      <Badge variant="outline">标准合计 {app.credit_standard} 分</Badge>
                    )}
                    {app.credit_compliance && app.credit_compliance !== "ok" && (
                      <Badge variant="destructive">{COMPLIANCE_LABEL[app.credit_compliance]}</Badge>
                    )}
                    {app.credit_compliance === "ok" && (
                      <Badge variant="outline">学分合规</Badge>
                    )}
                  </div>
                </div>
              )}

              {/* 学生提交的原申请表：页面内直接展示 + 下载 */}
              {app.form_file_path && (
                <FormFilePreview
                  path={app.form_file_path}
                  downloadName={`${student?.full_name || "学生"}-创新实践学分认定申请表.xlsx`}
                />
              )}

              {/* 佐证材料画廊（多图）或旧版单图 */}
              <div className="space-y-2">
                <div className="text-muted-foreground flex items-center gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> 佐证材料
                </div>
                <AttachmentsGallery applicationId={app.id} fallbackPath={app.file_path} />
              </div>

          </CardContent>
        </Card>

        {/* 学生视角：系统未通过简短结论 + 申请人工复核 */}
        {!isReviewer &&
          (app.status === "rejected_by_ai" ||
            (app.status === "pending_review" && manualReviewCount === 0)) && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-base text-destructive">系统未通过</CardTitle>
              <CardDescription>
                {app.status === "pending_review"
                  ? "你已申请人工复核，正在等待教师处理"
                  : "若你认为材料没有问题，可申请教师人工复核"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="rounded bg-destructive/10 p-3 text-sm">
                {studentShortReason || "材料未通过系统核验。"}
              </p>
              <Button
                onClick={requestManualReview}
                variant="outline"
                disabled={submitting || app.status === "pending_review"}
                title={app.status === "pending_review" ? "本轮人工复核已提交，请等待教师处理" : undefined}
              >
                {submitting ? "处理中…" : (app.status === "pending_review" ? "已提交人工复核，等待教师处理" : "申请人工复核")}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 学生视角：教师已复核且学生仍有异议时申请二次复核 */}
        {!isReviewer &&
          (app.status === "approved" ||
            app.status === "rejected" ||
            (app.status === "pending_review" && manualReviewCount >= 1)) &&
          manualReviewCount >= 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">仍有异议？</CardTitle>
              <CardDescription>
                {app.status === "pending_review"
                  ? `你已申请第 ${reReviewIndex} 次人工复核，正在等待教师处理`
                  : "你可以申请二次人工复核，教师将再次审阅"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={requestManualReview}
                variant="outline"
                disabled={submitting || app.status === "pending_review"}
                title={app.status === "pending_review" ? "本轮人工复核已提交，请等待教师处理" : undefined}
              >
                {submitting
                  ? "处理中…"
                  : (app.status === "pending_review"
                    ? "已提交人工复核，等待教师处理"
                    : "申请二次人工复核")}
              </Button>
            </CardContent>
          </Card>
        )}

        {isReviewer && libraryRefs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">关键词库推荐</CardTitle>
              <CardDescription>
                本申请的关键词在关键词库中的沉淀来源与日期，便于确认可靠性
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 text-left font-normal">关键词</th>
                      <th className="py-2 pr-3 text-left font-normal">分类</th>
                      <th className="py-2 pr-3 text-left font-normal">来源</th>
                      <th className="py-2 pr-3 text-left font-normal whitespace-nowrap">沉淀日期</th>
                      <th className="py-2 pr-3 text-left font-normal">使用次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libraryRefs.map((k) => (
                      <tr key={k.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{k.keyword}</td>
                        <td className="py-2 pr-3">
                          {k.category ? <Badge variant="secondary">{k.category}</Badge> : <span className="text-muted-foreground">{EMPTY_PLACEHOLDER}</span>}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{k.source ?? EMPTY_PLACEHOLDER}</td>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                          {formatDepositDate(k.created_at)}
                        </td>
                        <td className="py-2 pr-3">{k.usage_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {isReviewer && ((app as any).ai_last_error || (app as any).ai_previous_snapshot) && (
          <Card className={(app as any).ai_last_error ? "border-destructive" : ""}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {(app as any).ai_last_error ? (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                ) : (
                  <Undo2 className="h-4 w-4 text-muted-foreground" />
                )}
                AI 审核维护
              </CardTitle>
              {(app as any).ai_last_attempt_at && (
                <CardDescription>
                  最近一次 AI 调用时间：
                  {new Date((app as any).ai_last_attempt_at).toLocaleString("zh-CN", { hour12: false })}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {(app as any).ai_last_error && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <div className="font-medium text-destructive">AI 审核未完成</div>
                  <div className="mt-1 whitespace-pre-wrap text-foreground">
                    {toPlainText(String((app as any).ai_last_error ?? ""))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={retryAiEvaluation}
                  disabled={retrying || rollingBack}
                >
                  <RefreshCw className={`mr-1 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
                  {retrying ? "正在重试…" : "一键重试 AI 审核"}
                </Button>
                {(app as any).ai_previous_snapshot && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={rollbackAiSnapshot}
                    disabled={retrying || rollingBack}
                  >
                    <Undo2 className="mr-1 h-4 w-4" />
                    {rollingBack ? "回滚中…" : "回滚到上次审核结果"}
                  </Button>
                )}
              </div>
              {(app as any).ai_previous_snapshot?.taken_at && (
                <div className="text-xs text-muted-foreground">
                  上次结果备份于
                  {" "}
                  {new Date((app as any).ai_previous_snapshot.taken_at).toLocaleString("zh-CN", { hour12: false })}
                  ，状态「{(app as any).ai_previous_snapshot.status ?? "—"}」
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {isReviewer && (
          app.ai_reasoning ||
          app.ai_suggested_credit != null ||
          app.ai_confidence != null ||
          app.status === "rejected_by_ai" ||
          app.status === "auto_approved" ||
          app.ai_check_consistency != null
        ) && (
          <AiVerdictCard
            app={{
              status: app.status,
              ai_confidence: app.ai_confidence,
              ai_reasoning: app.ai_reasoning,
              ai_suggested_credit: app.ai_suggested_credit,
              ai_check_consistency: app.ai_check_consistency ?? null,
              ai_check_relevance: app.ai_check_relevance ?? null,
              ai_check_authenticity: app.ai_check_authenticity ?? null,
              ai_check_name_match: app.ai_check_name_match ?? null,
              ai_check_identity_match: (app as any).ai_check_identity_match ?? null,
              ai_check_logic: (app as any).ai_check_logic ?? null,
              ai_check_completeness: (app as any).ai_check_completeness ?? null,
              ai_identity_mismatch: (app as any).ai_identity_mismatch ?? null,
              ai_logic_issue: (app as any).ai_logic_issue ?? null,
              ai_blank_fields: (app as any).ai_blank_fields ?? null,
              ai_detected_student_no: (app as any).ai_detected_student_no ?? null,
              ai_detected_school: (app as any).ai_detected_school ?? null,
              ai_detected_project: app.ai_detected_project ?? null,
              ai_detected_achievement: app.ai_detected_achievement ?? null,
              ai_detected_level: app.ai_detected_level ?? null,
              ai_detected_identity: app.ai_detected_identity ?? null,
              ai_override_note: app.ai_override_note ?? null,
              review_source: app.review_source ?? null,
            }}
          />
        )}

        {isReviewer && app.status !== "pending_ai" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {["approved", "auto_approved"].includes(app.status) || app.status === "rejected" || app.status === "rejected_by_ai"
                  ? "修改审核结果"
                  : "人工复核"}
              </CardTitle>
              <CardDescription>
                {app.status === "auto_approved" && "系统已自动通过并计入学分。如需调整可在此修改。"}
                {app.status === "rejected_by_ai" && "系统已自动驳回。如学生有异议可在此覆盖结果。"}
                {app.status === "approved" && "已通过的申请，可在此调整最终学分或改判驳回。"}
                {app.status === "rejected" && "已驳回的申请，可在此重新通过。"}
                {app.status === "pending_review" && "系统无法自动判定，需要人工复核。"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>最终学分（通过时必填，仅支持键盘输入）</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={credit}
                  onChange={(e) => setCredit(Number(e.target.value))}
                  onWheel={(e) => (e.target as HTMLInputElement).blur()}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowDown") e.preventDefault();
                  }}
                />
              </div>
              <div>
                <Label>复核备注</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => decide("approved")} disabled={submitting}>
                  <Check className="mr-1 h-4 w-4" /> {submitting ? "处理中…" : "通过"}
                </Button>
                <Button variant="destructive" onClick={() => decide("rejected")} disabled={submitting}>
                  <X className="mr-1 h-4 w-4" /> {submitting ? "处理中…" : "驳回"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">审核记录</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(isReviewer ? reviews : reviews.filter((r) => r.action !== "ai_evaluation")).map((r) => (
              <div key={r.id} className="rounded border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {r.action === "ai_evaluation"
                        ? "系统核验"
                        : isReviewer
                          ? (r.action === "teacher_review" ? "教师复核" : "管理员复核")
                          : "教师复核"}
                    </Badge>
                    <StatusBadge status={r.decision as any} audience={isReviewer ? "staff" : "student"} />
                    {(r.credit != null || r.decision === "rejected" || r.decision === "rejected_by_ai") && (
                      <span className="text-muted-foreground">
                        学分 {r.decision === "rejected" || r.decision === "rejected_by_ai" ? 0 : r.credit}
                      </span>
                    )}
                    {isReviewer && r.confidence != null && (
                      <span className="text-muted-foreground">判定确信度 {(Number(r.confidence) * 100).toFixed(0)}%</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-CN", { hour12: false })}</span>
                </div>
                {r.note && <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{r.note}</p>}
              </div>
            ))}
            {(isReviewer ? reviews : reviews.filter((r) => r.action !== "ai_evaluation")).length === 0 && (
              <p className="text-sm text-muted-foreground">暂无审核记录</p>
            )}
          </CardContent>
        </Card>
      </div>
      {certData && createPortal(
        <div
          id="__cert_render__"
          style={{ position: "fixed", left: -99999, top: 0, zIndex: -1 }}
        >
          <CertificatePreview data={certData} orientation={orientation} />
        </div>,
        document.body,
      )}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!exporting) setPreviewOpen(o); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>学分认定证明 · 预览</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">PDF 方向：</span>
            <ToggleGroup
              type="single"
              value={orientation}
              onValueChange={(v) => v && setOrientation(v as "landscape" | "portrait")}
              size="sm"
              variant="outline"
            >
              <ToggleGroupItem value="landscape">A4 横版</ToggleGroupItem>
              <ToggleGroupItem value="portrait">A4 竖版</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {certData && (
            <div className="max-h-[65vh] overflow-auto rounded border bg-muted/20 p-4">
              <div
                style={{
                  transform: orientation === "portrait" ? "scale(0.55)" : "scale(0.6)",
                  transformOrigin: "top center",
                  width: orientation === "portrait" ? 794 : 1123,
                  margin: "0 auto",
                }}
              >
                <CertificatePreview data={certData} orientation={orientation} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={exporting}>
              取消
            </Button>
            <Button onClick={downloadCertificate} disabled={exporting}>
              <FileDown className="mr-1 h-4 w-4" />
              {exporting ? "导出中…" : "下载 PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={materialPreviewOpen} onOpenChange={setMaterialPreviewOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>提交材料 · 放大查看</DialogTitle>
          </DialogHeader>
          {fileUrl && <ZoomableImage src={fileUrl} alt="学生提交的材料" openUrl={fileUrl} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default ApplicationDetail;
