import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Bot, Loader2, Paperclip, Send, Sparkles, User, CheckCircle2, AlertCircle, Upload, ArrowRight, Download } from "lucide-react";
import {
  downloadRosterTemplate,
  downloadTeacherTemplate,
  parseRosterWorkbook,
  TEMPLATE_COLUMNS,
  type ParsedRow,
} from "@/lib/parseRoster";
import { toPlainText, translateFieldNames } from "@/lib/sanitizeMarkdown";
import { displayLabel, displayError } from "@/lib/displayText";

// 字段英文名 -> 中文显示名（用于预览表的错误悬浮提示）。
const FIELD_LABEL: Record<string, string> = {
  student_no: "学号/工号",
  full_name: "姓名",
  gender: "性别",
  birth_date: "出生日期",
  enrollment_year: "年级",
  phone: "手机号",
  bed_no: "床号",
  apartment_no: "公寓号",
  dorm_room: "宿舍号",
  password: "密码",
  college_name: "学院",
  role: "角色",
};

type ChatMsg =
  | { kind: "ai"; text: string }
  | { kind: "user"; text: string }
  | { kind: "file"; name: string; rowCount: number }
  | { kind: "preview"; rows: ParsedRow[]; notes?: string; rowErrors: RowErrors[] }
  | { kind: "result"; ok: boolean; text: string; created?: number; sampleNos?: string[] };

// Per-row field-level validation errors. Map: field name -> error message.
type RowErrors = Record<string, string>;

const CURRENT_YEAR = new Date().getFullYear();

/** Validate a single parsed row. Returns an error map (empty if all good). */
const validateRow = (r: ParsedRow, requireCollege = false, allowAdminRole = true): RowErrors => {
  const e: RowErrors = {};

  if (!r.student_no?.trim()) e.student_no = "学号不能为空";
  if (!r.full_name?.trim()) e.full_name = "姓名不能为空";

  if (r.gender && !["男", "女"].includes(r.gender.trim())) {
    e.gender = "性别只能是「男」或「女」";
  }

  if (r.birth_date) {
    const m = r.birth_date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      e.birth_date = "出生日期格式应为 YYYY-MM-DD";
    } else {
      const [_, ys, ms, ds] = m;
      const y = +ys, mo = +ms, d = +ds;
      // 使用 UTC 构造，避免本地时区导致 getUTCDate 偏移一天（如 +08 时区）
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (
        Number.isNaN(dt.getTime()) ||
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() + 1 !== mo ||
        dt.getUTCDate() !== d ||
        y < 1900 ||
        y > CURRENT_YEAR
      ) {
        e.birth_date = "出生日期不是合法日期";
      }
    }
  }

  if (r.enrollment_year != null) {
    const y = r.enrollment_year;
    if (!Number.isInteger(y) || y < 1990 || y > CURRENT_YEAR + 1) {
      e.enrollment_year = `年级应在 1990 - ${CURRENT_YEAR + 1} 之间`;
    }
  }

  if (r.phone) {
    const digits = r.phone.replace(/\D+/g, "");
    if (digits.length < 7 || digits.length > 15) {
      e.phone = "手机号位数异常（7-15 位数字）";
    }
  }

  if (r.bed_no) {
    const bed = r.bed_no.trim();
    if (!/^[\u4e00-\u9fa5A-Za-z0-9\-]{1,12}$/.test(bed)) {
      e.bed_no = "床号仅支持中文/字母/数字/横线，最多 12 位";
    }
  }

  if (r.apartment_no && r.apartment_no.length > 20) e.apartment_no = "公寓号过长";
  if (r.dorm_room && r.dorm_room.length > 20) e.dorm_room = "宿舍号过长";

  if (!r.password || r.password.length < 6) {
    e.password = "密码不足 6 位（请补全学号或电话）";
  }

  // Super admin imports must specify each row's college via the 学院 column
  // (普通学院管理员导入时由后端自动归属，无需在表里填写).
  if (requireCollege && (r.role === "teacher" || r.role === "admin")) {
    if (!r.college_name?.trim()) {
      e.college_name = "超级管理员导入教师/管理员时必须填写「学院」列";
    }
  }

  if (!allowAdminRole && r.role === "admin") {
    e.role = "仅超级管理员可导入「管理员」账号";
  }

  return e;
};

const normalizeCollegeName = (s: string) =>
  s.toLowerCase().replace(/[与和&\s院（）()]/g, "");

const ROLE_LABEL: Record<string, string> = { admin: "管理员", teacher: "教师", student: "学生" };

const ImportUsers = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFileNameRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      kind: "ai",
      text:
        "你好，请使用统一「账号导入模板」批量创建账号。\n\n步骤：\n1) 点击右上角「下载导入模板」获取 .xlsx\n2) 按列填写（必填：学号/工号、姓名、角色）\n3) 点击「上传文件」选择填好的 Excel\n4) 核对预览后点击「确认导入」\n\n模板列（共 16 列，顺序固定）：\n" +
        TEMPLATE_COLUMNS.map((c) => `• ${c.header}${c.required ? "（必填）" : ""} — ${c.note}`).join("\n") +
        "\n\n密码规则：自动生成 = 学号 + 手机号后 6 位（不足左补 0；无手机号则补 6 个 0）。无需在表中填写。",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRows, setPendingRows] = useState<ParsedRow[] | null>(null);
  const [defaults, setDefaults] = useState<{ role: ParsedRow["role"] }>({
    role: "student",
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [callerCollegeName, setCallerCollegeName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role, college_id")
        .eq("user_id", uid)
        .in("role", ["admin", "super_admin"]);
      const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
      if (active) setIsSuperAdmin(isSuper);
      if (!isSuper) {
        const cid = (roles ?? []).find((r) => r.role === "admin")?.college_id;
        if (cid) {
          const { data: c } = await supabase
            .from("colleges").select("name").eq("id", cid).maybeSingle();
          if (active) setCallerCollegeName((c as any)?.name ?? null);
        }
      }
    })();
    return () => { active = false; };
  }, []);

  const push = (m: ChatMsg) => setMessages((prev) => [...prev, m]);

  const handleUserMessage = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    push({ kind: "user", text });

    // Parse simple instructions like 默认角色=教师 / 默认密码=Abc123
    const roleMatch = text.match(/默认角色\s*[=:：]\s*(管理员|教师|老师|学生)/);
    const pwdMatch = text.match(/默认密码\s*[=:：]\s*(\S+)/);
    let updated = false;
    const next = { ...defaults };
    if (roleMatch) {
      const m = roleMatch[1];
      next.role = m === "管理员" ? "admin" : m === "学生" ? "student" : "teacher";
      updated = true;
    }
    if (pwdMatch) {
      push({
        kind: "ai",
        text: "已不再支持设置默认密码。系统统一按「学号 + 电话后 6 位」生成密码（电话不足 6 位时左侧补 0）。",
      });
      return;
    }
    if (updated) {
      setDefaults(next);
      push({
        kind: "ai",
        text: `好的，已更新默认角色：${ROLE_LABEL[next.role]}。请点击下方「上传文件」按钮选择 Excel/CSV 即可开始。`,
      });
      return;
    }
    // Detect explicit "how do I start importing" intent. Keep this narrow so other
    // questions (密码 / 学院 / 失败排查 …) fall through to the AI instead of always
    // returning the same canned 3-step blurb. Only intercept on the very first turn.
    const importIntent =
      /^(我要|我想|请帮我|帮我|怎么|如何)\s*(开始)?(批量)?(导入|上传)/.test(text) ||
      /^(怎么|如何)\s*(用|使用|操作)\s*$/.test(text);
    const isFirstTurn = messages.filter((m) => m.kind === "user").length === 0;
    if (importIntent && isFirstTurn && !pendingRows) {
      push({
        kind: "ai",
        text:
          "这里只能识别和预览数据，账号需要按下面三步手工创建：\n\n1) 点击输入框左侧的「上传文件」按钮，选择 Excel 或 CSV\n2) 在弹出的预览表中核对数据，异常行会标红\n3) 点击预览下方的「确认导入」按钮才会真正写入\n\n完成后会出现绿色的成功卡片，可以一键跳转到学生管理查看。",
      });
      return;
    }
    void askAi(text);
  };

  const askAi = async (question: string) => {
    setLoading(true);
    try {
      const history = messages
        .filter((m) => m.kind === "ai" || m.kind === "user")
        .map((m) => ({
          role: m.kind === "ai" ? ("assistant" as const) : ("user" as const),
          content: (m as { text: string }).text,
        }));
      history.push({ role: "user", content: question });

      const { data, error } = await supabase.functions.invoke("import-assistant-chat", {
        body: { messages: history, defaults },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let detail = error.message;
        try {
          const t = await ctx?.text?.();
          if (t) detail = JSON.parse(t).error ?? detail;
        } catch {}
        push({ kind: "ai", text: `❌ 助手暂时不可用：${detail}` });
        return;
      }
      push({ kind: "ai", text: data?.answer ?? "（无回答）" });
    } catch (e) {
      push({ kind: "ai", text: `助手出错：${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      lastFileNameRef.current = file.name;
      const result = await parseRosterWorkbook(file, defaults.role);
      if (result.ok !== true) {
        push({ kind: "ai", text: `❌ ${(result as { error: string }).error}` });
        return;
      }
      const rows = result.rows;
      push({ kind: "file", name: file.name, rowCount: rows.length });

      // Per-row format validation BEFORE allowing import.
      const rowErrors = rows.map((r) => validateRow(r, isSuperAdmin, isSuperAdmin));

      // College-admin: reject any row whose 学院 column points at another college.
      if (!isSuperAdmin && callerCollegeName) {
        const callerNorm = normalizeCollegeName(callerCollegeName);
        rows.forEach((r, i) => {
          const cname = r.college_name?.trim();
          if (cname && normalizeCollegeName(cname) !== callerNorm) {
            rowErrors[i] = {
              ...rowErrors[i],
              college_name: `学院「${cname}」与你管理的「${callerCollegeName}」不一致，无法跨学院导入`,
            };
          }
        });
      }
      const badCount = rowErrors.filter((e) => Object.keys(e).length > 0).length;

      setPendingRows(rows);
      push({ kind: "preview", rows, rowErrors });
      if (badCount > 0) {
        // Collect first few sample errors for the chat hint
        const samples = rowErrors
          .map((e, i) => ({ i, e }))
          .filter((x) => Object.keys(x.e).length > 0)
          .slice(0, 5)
          .map((x) =>
            `第 ${x.i + 2} 行（${rows[x.i].student_no || "无学号"}）：${Object.values(x.e).join("；")}`,
          )
          .join("\n");
        push({
          kind: "ai",
          text:
            `解析完成。共 ${rows.length} 行，其中 ${badCount} 行存在格式问题（已在预览表中标红）。\n请修正源表后重新上传。\n\n示例：\n${samples}`,
        });
      } else {
        push({
          kind: "ai",
          text: `解析完成。共 ${rows.length} 个账号待创建，所有字段格式校验通过。请核对预览后点击下方「确认导入」。`,
        });
      }
    } catch (e) {
      push({ kind: "ai", text: `读取文件失败：${(e as Error).message}` });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const CHUNK_SIZE = 200; // send 200 users per request to avoid timeout

  const confirmImport = async () => {
    if (!pendingRows) return;
    // Block import if any pending row failed format validation.
    const errs = pendingRows.map((r) => validateRow(r, isSuperAdmin, isSuperAdmin));
    if (!isSuperAdmin && callerCollegeName) {
      const callerNorm = normalizeCollegeName(callerCollegeName);
      pendingRows.forEach((r, i) => {
        const cname = r.college_name?.trim();
        if (cname && normalizeCollegeName(cname) !== callerNorm) {
          errs[i] = { ...errs[i], college_name: `学院「${cname}」与你管理的「${callerCollegeName}」不一致` };
        }
      });
    }
    const badCount = errs.filter((e) => Object.keys(e).length > 0).length;
    if (badCount > 0) {
      toast({
        title: "无法导入",
        description: `仍有 ${badCount} 行格式异常，请修正源表后重新上传`,
        variant: "destructive",
      });
      push({
        kind: "ai",
        text: `已阻止导入：仍有 ${badCount} 行字段格式异常（红色标注）。请修正源表后重新上传。`,
      });
      return;
    }
    setLoading(true);
    push({ kind: "user", text: "确认导入" });

    const totalRows = pendingRows;
    const chunks = [];
    for (let i = 0; i < totalRows.length; i += CHUNK_SIZE) {
      chunks.push(totalRows.slice(i, i + CHUNK_SIZE));
    }

    let totalCreated = 0;
    let totalSkipped = 0;
    let failed = false;

    for (let ci = 0; ci < chunks.length; ci++) {
      push({
        kind: "ai",
        text: `正在导入第 ${ci + 1}/${chunks.length} 批（${chunks[ci].length} 个账号）…`,
      });

      const { data, error } = await supabase.functions.invoke("import-users", {
        body: { rows: chunks[ci], file_name: lastFileNameRef.current, skip_existing: true },
      });

      if (error) {
        const ctx: any = (error as any).context;
        let detail = error.message;
        let extras: string[] = [];
        let aiErrors: { line: number; message: string }[] = [];
        let aiConflicts: string[] = [];
        try {
          const t = await ctx?.text?.();
          if (t) {
            const j = JSON.parse(t);
            detail = j.error ?? detail;
            if (j.errors) {
              aiErrors = j.errors;
              extras = j.errors.map((e: any) => `第 ${e.line} 行：${e.message}`);
            }
            if (j.conflicts) {
              aiConflicts = j.conflicts;
              extras = j.conflicts.map((c: string) => `已存在：${c}`);
            }
          }
        } catch {}

        // Ask AI for a human-readable explanation (structured errors only — never the raw Excel).
        let aiHint = "";
        if (aiErrors.length || aiConflicts.length) {
          try {
            const { data: ex } = await supabase.functions.invoke("ai-explain-import", {
              body: {
                errors: aiErrors,
                conflicts: aiConflicts,
                total: chunks[ci].length,
              },
            });
            if (ex?.summary) {
              aiHint = `\n\nAI 诊断：${ex.summary}` +
                (ex.suggestions?.length ? `\n建议：\n• ${ex.suggestions.join("\n• ")}` : "");
            }
          } catch { /* ignore */ }
        }

        push({
          kind: "result",
          ok: false,
          text: translateFieldNames(`第 ${ci + 1} 批失败：${[detail, ...extras].join("\n")}\n已成功导入前 ${totalCreated} 个账号。${aiHint}`),
        });
        toast({ title: "导入部分失败", description: detail, variant: "destructive" });
        failed = true;
        break;
      }

      if (data?.success) {
        totalCreated += data.created;
        if (typeof data.skipped === "number") totalSkipped += data.skipped;
      }
    }

    if (!failed) {
      const sampleNos = totalRows.slice(0, 5).map((r) => r.student_no);
      const skipNote = totalSkipped > 0 ? `（跳过 ${totalSkipped} 个已存在的学号）` : "";
      push({
        kind: "result",
        ok: true,
        text: `全部完成。成功创建 ${totalCreated} 个账号${skipNote}，已写入数据库（姓名 / 学号 / 专业 / 班级 / 院系 / 手机号 / 宿舍等字段均已绑定）。`,
        created: totalCreated,
        sampleNos,
      });
      toast({ title: "导入成功", description: `已新增 ${totalCreated} 个账号${skipNote}` });
      setPendingRows(null);
    }

    setLoading(false);
  };

  return (
    <AppLayout>
      <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI 名册导入助手</h1>
            <p className="text-xs text-muted-foreground">
              上传 Excel/CSV，自动识别字段并批量创建账号
            </p>
          </div>
          <div className="ml-auto flex gap-2 text-xs">
            <Badge variant="outline">默认角色：{ROLE_LABEL[defaults.role]}</Badge>
            <Badge variant="outline">密码规则：学号 + 电话后 6 位</Badge>
          </div>
        </div>

        {/* Prominent upload banner — always visible so the upload affordance is impossible to miss */}
        <div className="mb-3 flex items-center gap-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">使用统一模板导入账号</p>
              <p className="text-xs text-muted-foreground">
                先下载模板按列填写，再上传 Excel；系统按固定表头解析，避免列名歧义。
                {!isSuperAdmin && callerCollegeName ? `本次只能导入「${callerCollegeName}」的账号。` : ""}
              </p>
            </div>
            <Button onClick={downloadRosterTemplate} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              下载学生模板
            </Button>
            <Button onClick={downloadTeacherTemplate} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              下载教师模板
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={loading} size="sm">
              <Upload className="mr-2 h-4 w-4" />
              选择文件
            </Button>
        </div>

        <Card className="flex flex-1 flex-col overflow-hidden">
          <CardContent className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} onConfirm={confirmImport} loading={loading} />
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> 处理中…
              </div>
            )}
          </CardContent>

          <div className="border-t bg-muted/30 p-3">
            {/* 快速提问模板 — 仅在未进入预览阶段时显示 */}
            {!pendingRows && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[
                  "默认角色=教师",
                  "默认角色=学生",
                  "怎么导入教师账号？",
                  "学院列必须填什么？",
                  "密码规则是什么？",
                  "导入失败怎么排查？",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    disabled={loading}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                title="上传 Excel/CSV"
                className="shrink-0"
              >
                <Paperclip className="mr-1.5 h-4 w-4" />
                上传文件
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUserMessage()}
                placeholder="提问或调整默认角色，如：默认角色=学生"
                disabled={loading}
              />
              <Button onClick={handleUserMessage} disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
};

const MessageBubble = ({
  msg,
  onConfirm,
  loading,
}: {
  msg: ChatMsg;
  onConfirm: () => void;
  loading: boolean;
}) => {
  if (msg.kind === "user") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground">
          {msg.text}
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  if (msg.kind === "ai") {
    return (
      <div className="flex gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-muted px-4 py-2 text-sm">
          {toPlainText(msg.text)}
        </div>
      </div>
    );
  }

  if (msg.kind === "file") {
    return (
      <div className="flex justify-end gap-2">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm border bg-background px-4 py-2 text-sm">
          {msg.name} · {msg.rowCount} 行
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  if (msg.kind === "preview") {
    const rowErrors = msg.rowErrors ?? [];
    const badCount = rowErrors.filter((e) => Object.keys(e).length > 0).length;
    const cellCls = (i: number, field: string) =>
      rowErrors[i]?.[field] ? "bg-destructive/15 text-destructive" : "";
    return (
      <div className="flex gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
          <Bot className="h-4 w-4" />
        </div>
        <div className="w-full max-w-[90%] space-y-2 rounded-2xl rounded-tl-sm border bg-background p-3">
          {msg.notes && (
            <p className="text-xs italic text-muted-foreground">AI 备注：{msg.notes}</p>
          )}
          {badCount > 0 && (
            <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>共 {badCount} 行存在字段格式异常（红色高亮），请修正源表后重新上传</span>
            </div>
          )}
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">行号</TableHead>
                  <TableHead>学号/工号</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>院系</TableHead>
                  <TableHead>专业</TableHead>
                  <TableHead>班级</TableHead>
                  <TableHead>年级</TableHead>
                  <TableHead>性别</TableHead>
                  <TableHead>民族</TableHead>
                  <TableHead>政治面貌</TableHead>
                  <TableHead>出生日期</TableHead>
                  <TableHead>辅导员</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>公寓号</TableHead>
                  <TableHead>宿舍号</TableHead>
                  <TableHead>床号</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {msg.rows.slice(0, 50).map((r, i) => {
                  const errs = rowErrors[i] ?? {};
                  const hasErr = Object.keys(errs).length > 0;
                  const errSummary = Object.entries(errs)
                      .map(([k, v]) => `${FIELD_LABEL[k] ?? displayLabel(k)}：${displayError(String(v))}`)
                    .join("\n");
                  return (
                    <TableRow
                      key={i}
                      className={hasErr ? "bg-destructive/5 hover:bg-destructive/10" : undefined}
                      title={hasErr ? errSummary : undefined}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {hasErr ? (
                          <span className="inline-flex items-center gap-1 text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            {i + 2}
                          </span>
                        ) : (
                          i + 2
                        )}
                      </TableCell>
                      <TableCell className={`font-mono text-xs ${cellCls(i, "student_no")}`}>{r.student_no}</TableCell>
                      <TableCell className={cellCls(i, "full_name")}>{r.full_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{ROLE_LABEL[r.role]}</Badge>
                      </TableCell>
                      <TableCell>{r.department ?? "—"}</TableCell>
                      <TableCell>{r.major ?? "—"}</TableCell>
                      <TableCell>{r.class_name ?? "—"}</TableCell>
                      <TableCell className={cellCls(i, "enrollment_year")}>{r.enrollment_year ?? "—"}</TableCell>
                      <TableCell className={cellCls(i, "gender")}>{r.gender ?? "—"}</TableCell>
                      <TableCell>{r.ethnicity ?? "—"}</TableCell>
                      <TableCell>{r.political_status ?? "—"}</TableCell>
                      <TableCell className={cellCls(i, "birth_date")}>{r.birth_date ?? "—"}</TableCell>
                      <TableCell>{r.advisor ?? "—"}</TableCell>
                      <TableCell className={cellCls(i, "phone")}>{r.phone ?? "—"}</TableCell>
                      <TableCell className={cellCls(i, "apartment_no")}>{r.apartment_no ?? "—"}</TableCell>
                      <TableCell className={cellCls(i, "dorm_room")}>{r.dorm_room ?? "—"}</TableCell>
                      <TableCell className={cellCls(i, "bed_no")}>{r.bed_no ?? "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {msg.rows.length > 50 && (
              <p className="border-t p-2 text-center text-xs text-muted-foreground">
                仅预览前 50 行，共 {msg.rows.length} 行
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            {badCount > 0 && (
              <span className="text-xs text-destructive">
                {badCount} 行格式异常，无法导入
              </span>
            )}
            <Button onClick={onConfirm} disabled={loading || badCount > 0} size="sm">
              确认导入 {msg.rows.length - badCount} 个账号
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // result
  return (
    <div className="flex gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
        <Bot className="h-4 w-4" />
      </div>
      <div
        className={`max-w-[85%] space-y-2 whitespace-pre-wrap rounded-2xl rounded-tl-sm border-2 px-4 py-3 text-sm ${
          msg.ok
            ? "border-green-500/60 bg-green-500/10"
            : "border-destructive/60 bg-destructive/10"
        }`}
      >
        <div className="flex items-center gap-2 text-base font-semibold">
          {msg.ok ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-destructive" />
          )}
          {msg.ok ? `导入成功${msg.created ? ` · 共 ${msg.created} 个账号` : ""}` : "导入失败"}
        </div>
        <div className="text-sm">{toPlainText(msg.text)}</div>
        {msg.ok && msg.sampleNos && msg.sampleNos.length > 0 && (
          <div className="rounded border bg-background/60 px-2 py-1.5 text-xs">
            <span className="text-muted-foreground">示例学号：</span>
            <span className="font-mono">{msg.sampleNos.join("、")}</span>
            {msg.created && msg.created > msg.sampleNos.length && (
              <span className="text-muted-foreground"> 等共 {msg.created} 个</span>
            )}
          </div>
        )}
        {msg.ok && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="default">
              <Link to="/admin/users/students">
                去学生管理查看 <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/users/teachers">查看教师列表</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImportUsers;
