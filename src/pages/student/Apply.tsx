import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import ProcessSteps from "@/components/ProcessSteps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Download, Upload, FileSpreadsheet, ImagePlus, Trash2, AlertTriangle, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { sha256Hex as sha256OfFile } from "@/lib/fileHash";
import { randomUUID as newUuid } from "@/lib/uuid";
import { parseApplicationForm, serializeItems, type FormItem } from "@/lib/parseForm";
import { lookupStandardCredit, checkCreditCompliance, COMPLIANCE_LABEL } from "@/lib/creditStandard";
import { buildAchievementFingerprint } from "@/lib/keywordFingerprint";

const BUCKET = "application-files";
const MAX_IMAGES = 20;
const MAX_SIZE = 10 * 1024 * 1024;
const IMG_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

type AttachmentDraft = {
  id: string;
  file: File;
  hash: string | null;
  preview: string;
  dup: boolean;
};

export default function Apply() {
  const { user, collegeId } = useAuth();
  const navigate = useNavigate();

  const [windowOk, setWindowOk] = useState<boolean | null>(null);
  const [windowName, setWindowName] = useState<string | null>(null);

  const [formFile, setFormFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [items, setItems] = useState<FormItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const formInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // 提交窗口检查
  useEffect(() => {
    (async () => {
      if (!collegeId) { setWindowOk(false); return; }
      const { data, error } = await supabase.rpc("current_open_window", { _college: collegeId });
      if (error) { setWindowOk(null); return; }
      const w = Array.isArray(data) ? data[0] : data;
      setWindowOk(!!w);
      setWindowName(w?.name ?? null);
    })();
  }, [collegeId]);

  // 每条目的标准学分比对
  const itemChecks = useMemo(() => {
    if (!items) return [];
    return items.map((it) => {
      const std = lookupStandardCredit({
        category: it.category, project: it.project,
        achievement: it.achievement, level: it.level, rank: it.rank,
      });
      return { item: it, std, compliance: checkCreditCompliance(it.credit, std) };
    });
  }, [items]);

  const claimedTotal = useMemo(
    () => (items ?? []).reduce((s, it) => s + (it.credit ?? 0), 0),
    [items],
  );
  const standardTotal = useMemo(() => {
    const nums = itemChecks.map((c) => c.std.credit).filter((n): n is number => n != null);
    return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  }, [itemChecks]);
  const complianceOverall = useMemo(() => {
    if (!itemChecks.length) return "unknown" as const;
    if (itemChecks.some((c) => c.compliance === "over")) return "over" as const;
    if (itemChecks.some((c) => c.compliance === "under")) return "under" as const;
    if (itemChecks.every((c) => c.compliance === "ok")) return "ok" as const;
    return "unknown" as const;
  }, [itemChecks]);

  const onPickForm = async (f: File | null) => {
    setParseError(null);
    setItems(null);
    setFormFile(null);
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      setParseError("请上传从系统下载的 .xlsx 申请表");
      return;
    }
    setParsing(true);
    const res = await parseApplicationForm(f);
    setParsing(false);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    setFormFile(f);
    setItems(res.items);
    toast.success(`已解析出 ${res.items.length} 条认定条目`);
  };

  const onPickImages = async (files: FileList | null) => {
    if (!files) return;
    const next = [...attachments];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_IMAGES) { toast.error(`最多上传 ${MAX_IMAGES} 张佐证图片`); break; }
      if (!IMG_RE.test(f.name) && !f.type.startsWith("image/")) { toast.error(`${f.name} 不是图片文件`); continue; }
      if (f.size > MAX_SIZE) { toast.error(`${f.name} 超过 10MB 限制`); continue; }
      let hash: string | null = null;
      try { hash = await sha256OfFile(f); } catch { /* 忽略 */ }
      const draft: AttachmentDraft = {
        id: newUuid(), file: f, hash,
        preview: URL.createObjectURL(f), dup: false,
      };
      // 本批次内查重
      if (hash && next.some((a) => a.hash === hash)) {
        toast.error(`${f.name} 与已选图片重复`);
        continue;
      }
      // 全库查重：该图是否已被任何申请使用
      if (hash) {
        const { data: used } = await supabase
          .from("application_attachments").select("id").eq("file_hash", hash).limit(1);
        if (used && used.length > 0) {
          toast.error(`「${f.name}」已被提交过，请勿重复使用同一张佐证图片`);
          continue;
        }
        const { data: used2 } = await supabase
          .from("applications").select("id").eq("file_hash", hash).limit(1);
        if (used2 && used2.length > 0) {
          toast.error(`「${f.name}」已被提交过，请勿重复使用同一张佐证图片`);
          continue;
        }
      }
      next.push(draft);
    }
    setAttachments(next);
    if (imgInputRef.current) imgInputRef.current.value = "";
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const t = prev.find((a) => a.id === id);
      if (t) URL.revokeObjectURL(t.preview);
      return prev.filter((a) => a.id !== id);
    });
  };

  const canSubmit =
    !!user && windowOk === true && !!formFile && !!items && items.length > 0 &&
    attachments.length > 0 && !submitting && !parsing;

  const submit = async () => {
    if (!user || !items || !formFile) return;
    if (attachments.length === 0) { toast.error("请至少上传 1 张佐证材料图片"); return; }
    setSubmitting(true);
    try {
      // 同一学生已通过的「成果+级别」拦截（软提示交给 DB 守卫兜底）
      const fps = items.map((it) => buildAchievementFingerprint(it.achievement, it.level)).filter(Boolean);
      if (fps.length) {
        const { data: passed } = await supabase
          .from("applications")
          .select("id, keywords_fingerprint")
          .eq("student_id", user.id)
          .in("status", ["approved", "auto_approved"])
          .in("keywords_fingerprint", fps)
          .limit(1);
        if (passed && passed.length > 0) {
          throw new Error("表中存在已认定通过的相同成果（同级别），同一成果只认定最高级别，请删除后重新提交");
        }
      }

      const stamp = Date.now();
      // 1) 上传申请表
      const formPath = `${user.id}/form-${stamp}-${formFile.name.replace(/[^\w.\-一-龥]/g, "_")}`;
      const { error: formErr } = await supabase.storage.from(BUCKET).upload(formPath, formFile);
      if (formErr) throw formErr;

      // 2) 上传佐证图片
      const uploaded: { path: string; name: string; hash: string | null }[] = [];
      for (let i = 0; i < attachments.length; i++) {
        const a = attachments[i];
        const p = `${user.id}/ev-${stamp}-${i}-${a.file.name.replace(/[^\w.\-一-龥]/g, "_")}`;
        const { error } = await supabase.storage.from(BUCKET).upload(p, a.file);
        if (error) throw error;
        uploaded.push({ path: p, name: a.file.name, hash: a.hash });
      }

      const first = items[0];
      const { data: appRow, error: insErr } = await supabase
        .from("applications")
        .insert({
          student_id: user.id,
          description: serializeItems(items),
          selected_keywords: Array.from(new Set(items.map((i) => i.category))),
          custom_keywords: Array.from(new Set(items.map((i) => i.achievement))),
          file_path: uploaded[0].path,
          file_hash: uploaded[0].hash,
          form_file_path: formPath,
          item_category: first.category,
          item_project: first.project,
          achievement_name: first.achievement,
          level_name: first.level,
          self_rank: first.rank,
          claimed_credit: claimedTotal || null,
          credit_standard: standardTotal,
          credit_compliance: complianceOverall,
          keywords_fingerprint: fps[0] || null,
          status: "pending_ai",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 3) 附件记录
      const { error: attErr } = await supabase.from("application_attachments").insert(
        uploaded.map((u, i) => ({
          application_id: appRow.id,
          file_path: u.path,
          file_name: u.name,
          file_hash: u.hash,
          sort_order: i,
        })),
      );
      if (attErr) throw attErr;

      // 4) 人脸比对（尽力而为，不阻塞）
      supabase.functions.invoke("face-compare", { body: { application_id: appRow.id } })
        .catch(() => { /* ignore */ });

      toast.success("提交成功，系统正在核验材料真伪");
      navigate("/my-applications");
    } catch (e) {
      toastError(e, "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="提交学分认定申请" description="下载模板填表 → 上传申请表与佐证材料 → 系统核验真伪" />

        <Card>
          <CardContent className="pt-6">
            <ProcessSteps
              currentStep={items ? (attachments.length ? 2 : 1) : 0}
              steps={[
                { label: "下载并填写申请表", description: "按模板逐条填写成果" },
                { label: "上传申请表与佐证", description: "Excel + 图片" },
                { label: "提交系统核验", description: "只验真伪，学分以教师认定为准" },
              ]}
            />
          </CardContent>
        </Card>

        {windowOk === false && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>当前不在开放提交时间内，请联系学院管理员开放提交窗口后再试。</AlertDescription>
          </Alert>
        )}
        {windowOk === true && windowName && (
          <Alert>
            <AlertDescription>当前开放批次：{windowName}</AlertDescription>
          </Alert>
        )}

        {/* 第一步：下载模板 */}
        <Card>
          <CardHeader><CardTitle className="text-base">第一步：下载申请表模板</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>· 用 Excel / WPS 打开模板，按四个大类逐条填写：认定项目、成果名称、级别、本人排名、认定学分。</p>
              <p>· 「认定学分」请对照《创新实践学分认定办法》标准填写，系统会帮你校验是否超标。</p>
              <p>· 不要改动表头和「认定项目/成果名称/级别/排名/学分」列结构，否则无法识别。</p>
              <p>· 第二课堂活动（学术报告、培训等）填在「四、职业技能」大类，每 16 学时或 1 周记 1 学分。</p>
            </div>
            <Button asChild variant="outline">
              <a href="/templates/申请表模板.xlsx" download>
                <Download className="mr-2 h-4 w-4" /> 下载《创新实践学分认定申请表》模板
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* 第二步：上传 */}
        <Card>
          <CardHeader><CardTitle className="text-base">第二步：上传申请表与佐证材料</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={formInputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => onPickForm(e.target.files?.[0] ?? null)}
            />
            <input
              ref={imgInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => onPickImages(e.target.files)}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => formInputRef.current?.click()} disabled={parsing}>
                {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                {formFile ? "重新选择申请表" : "上传填好的申请表（.xlsx）"}
              </Button>
              {formFile && <span className="text-sm text-muted-foreground">{formFile.name}</span>}
            </div>

            {parseError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{parseError}</AlertDescription>
              </Alert>
            )}

            {items && (
              <div className="space-y-2">
                <div className="text-sm font-medium">解析出 {items.length} 条认定条目（自报合计 {claimedTotal} 学分）</div>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>大类</TableHead>
                      <TableHead>成果名称</TableHead>
                      <TableHead>级别</TableHead>
                      <TableHead>排名</TableHead>
                      <TableHead className="text-right">自报学分</TableHead>
                      <TableHead>标准比对</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {itemChecks.map(({ item, std, compliance }) => (
                        <TableRow key={item.index}>
                          <TableCell>{item.index}</TableCell>
                          <TableCell className="whitespace-nowrap">{item.category}</TableCell>
                          <TableCell className="max-w-[220px] truncate" title={item.achievement}>{item.achievement}</TableCell>
                          <TableCell className="whitespace-nowrap">{item.level}</TableCell>
                          <TableCell className="whitespace-nowrap">{item.rank}</TableCell>
                          <TableCell className="text-right">{item.credit ?? "—"}</TableCell>
                          <TableCell>
                            {compliance === "ok" && <Badge variant="outline" className="text-success border-success/40">{COMPLIANCE_LABEL.ok}</Badge>}
                            {compliance === "over" && (
                              <Badge variant="destructive">超标{std.credit != null ? `（标准 ${std.credit}）` : ""}</Badge>
                            )}
                            {compliance === "under" && (
                              <Badge variant="outline" className="text-warning border-warning/40">偏低{std.credit != null ? `（标准 ${std.credit}）` : ""}</Badge>
                            )}
                            {compliance === "unknown" && <Badge variant="secondary">待人工核定</Badge>}
                            {std.basis && compliance !== "ok" && (
                              <div className="mt-0.5 max-w-[220px] text-xs text-muted-foreground">{std.basis}</div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {complianceOverall === "over" && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      有条目自报学分高于认定标准{standardTotal != null ? `（自报合计 ${claimedTotal}，标准合计 ${standardTotal}）` : ""}。
                      仍可提交，最终以教师认定为准。
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => imgInputRef.current?.click()}>
                  <ImagePlus className="mr-2 h-4 w-4" /> 添加佐证图片（{attachments.length}/{MAX_IMAGES}）
                </Button>
                <span className="text-xs text-muted-foreground">证书、获奖文件、证明等拍照或截图，每张 ≤10MB；同一张图片不能重复提交</span>
              </div>
              {attachments.length > 0 && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {attachments.map((a) => (
                    <div key={a.id} className="group relative aspect-[4/3] overflow-hidden rounded-md border">
                      <img src={a.preview} alt={a.file.name} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(a.id)}
                        className="absolute right-1 top-1 rounded-full bg-background/80 p-1 opacity-0 transition group-hover:opacity-100"
                        aria-label="删除"
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 提交 */}
        <Card>
          <CardContent className="flex items-center justify-between gap-3 pt-6">
            <div className="text-sm text-muted-foreground">
              提交后系统自动核验：材料真伪、身份一致性、是否 P 图 / AI 生成、学分是否符合标准。
            </div>
            <Button onClick={submit} disabled={!canSubmit}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              提交申请
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
