import { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X, Send, Loader2, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AssistantMessage from "@/components/AssistantMessage";
import {
  useStaffAssistantStore,
  staffAssistantActions,
  WELCOME,
  type Candidate,
  type Msg,
} from "@/hooks/useStaffAssistantStore";

const METRIC_LABELS: Record<string, string> = {
  pending_review: "待人工复核",
  pending_ai: "AI 审核中",
  approved_week: "近 7 天人工通过数",
  rejected_week: "近 7 天驳回数",
  total_students: "学生总人数",
  total_apps_month: "近 30 天提交申请数",
  submitted_total: "累计提交学生数",
  submitted_count: "累计申请总数",
  submitted_students_week: "近 7 天提交学生数",
  submitted_count_week: "近 7 天提交申请数",
  submitted_students_month: "近 30 天提交学生数",
  passed_students: "学分合格学生数",
  failing_students: "学分不合格学生数",
  auto_approved_total: "系统自动通过数",
  manual_approved_total: "人工复核通过数",
  rejected_total: "累计驳回数",
  rules_overview: "规则库概览",
  cases_overview: "案例库概览",
  keywords_overview: "关键词库概览",
  certificate_types_overview: "证书类型概览",
  submission_records_overview: "申请流水概览",
  aigc_fake_week: "近 7 天高风险图片",
  aigc_suspect_week: "近 7 天嫌疑图片",
  aigc_pending_total: "待 AI 鉴别图片",
  aigc_overview: "AI 生成材料概览",
  submitted_students: "提交学生数",
  status_breakdown: "状态分布",
  not_submitted_students: "未提交学生数",
  aigc_breakdown: "AI 鉴别分布",
};

const STATUS_LABELS: Record<string, string> = {
  auto_approved: "系统自动通过",
  approved: "人工通过",
  rejected: "人工驳回",
  rejected_by_ai: "AI 初审驳回",
  pending_review: "待人工复核",
  pending_ai: "AI 审核中",
  fake: "高风险",
  suspect: "嫌疑",
  real: "通过",
  pending: "待检测",
  skipped: "跳过",
  error: "检测失败",
};

const PATH_LABELS: Array<[RegExp, string]> = [
  [/^\/admin\/users\/students/, "打开学生管理"],
  [/^\/admin\/users\/teachers/, "打开教师管理"],
  [/^\/admin\/credits/, "打开学分统计"],
  [/^\/teacher\/credits/, "打开学分统计"],
  [/^\/admin\/review/, "打开复核中心"],
  [/^\/reviews/, "打开审核列表"],
  [/^\/admin\/dashboard/, "打开数据看板"],
  [/^\/teacher\/dashboard/, "打开数据看板"],
  [/^\/admin\/rules/, "打开规则库"],
  [/^\/admin\/cases/, "打开案例库"],
  [/^\/admin\/keywords/, "打开关键词库"],
  [/^\/admin\/import/, "打开批量导入"],
  [/^\/admin\/audit-logs/, "打开审计日志"],
  [/^\/teacher\/students\/[^/]+/, "打开学生档案"],
  [/^\/teacher\/students/, "打开学生列表"],
  [/^\/applications\//, "查看申请详情"],
];

const labelForPath = (path: string): string => {
  for (const [re, label] of PATH_LABELS) if (re.test(path)) return label;
  return "打开对应页面";
};

const StaffAiAssistant = () => {
  const { hasRole, isSuperAdmin } = useAuth();
  const role = isSuperAdmin ? "super_admin" : hasRole("admin") ? "admin" : "teacher";
  const roleLabel = role === "super_admin" ? "超级管理员" : role === "admin" ? "管理员" : "教师";
  const navigate = useNavigate();
  const { open, messages, input } = useStaffAssistantStore();
  const { setOpen, setMessages, setInput, clearMessages } = staffAssistantActions;
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    const next: Msg[] = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    try {
      const history = next.filter((m) => m.content !== WELCOME.content).map((m) => ({ role: m.role, content: m.content }));
      const invokePromise = supabase.functions.invoke("staff-ai-assistant", {
        body: { messages: history, role },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("请求超时（30 秒），请检查网络后重试")), 30000),
      );
      const { data, error } = (await Promise.race([invokePromise, timeoutPromise])) as Awaited<typeof invokePromise>;
      if (error) throw error;
      const d = data as any;
      const assistantMsg: Msg = {
        role: "assistant",
        content: d?.answer || "（无回答）",
        candidates: d?.candidates ?? null,
        stats: d?.stats ?? null,
        action: d?.action ?? null,
        sections: d?.sections ?? null,
        polished: !!d?.meta?.polished,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (d?.action?.type === "navigate" && !d?.candidates?.length && d?.action?.payload?.path) {
        setTimeout(() => {
          navigate(d.action.payload.path);
        }, 400);
      }
    } catch (e: any) {
      const isTimeout = /超时|timeout/i.test(e?.message || "");
      toast({
        title: isTimeout ? "请求超时" : "助手暂时不可用",
        description: (/[\u4e00-\u9fa5]/.test(String(e?.message ?? "")) ? e.message : "请稍后再试"),
        variant: "destructive",
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isTimeout
            ? "⚠️ 请求超时，可能是网络较慢或服务繁忙。请稍后重试。"
            : `⚠️ 服务暂时不可用：${e?.message || "未知错误"}。请稍后重试。`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const goCandidate = (c: Candidate) => {
    const path = role === "teacher"
      ? `/teacher/students/${c.user_id}`
      : `/admin/users/students?search=${encodeURIComponent(c.student_no || c.full_name || "")}`;
    navigate(path);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="打开工作助手"
        className="fixed bottom-20 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-20 right-6 z-50 isolate flex h-[min(520px,calc(100vh-6rem))] max-h-[calc(100vh-6rem)] w-[calc(100vw-2rem)] max-w-[420px] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl sm:w-[420px]"
      style={{ backgroundColor: "hsl(var(--card))" }}
    >
      <header
        className="flex items-center justify-between border-b px-4 py-3 text-primary-foreground rounded-t-xl"
        style={{ background: "linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary-glow)))" }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">工作助手</span>
          <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">{roleLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            onClick={clearMessages}
            title="清空对话"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => setOpen(false)} title="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-3 p-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                  {m.role === "user" ? (
                    <div className="max-w-[85%]">
                      <AssistantMessage variant="user" content={m.content} />
                    </div>
                  ) : (
                    <AssistantMessage content={m.content} sections={m.sections} polished={m.polished} />
                  )}

                  {m.candidates && m.candidates.length > 0 && (
                    <div className="flex w-full max-w-[90%] flex-col gap-1.5">
                      {m.candidates.map((c) => (
                        <button
                          key={c.user_id}
                          onClick={() => goCandidate(c)}
                          className="group flex items-center justify-between gap-2 rounded-md border bg-card p-2 text-left text-xs transition hover:border-primary hover:bg-muted/40"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium">{c.full_name || "—"} <span className="ml-1 text-muted-foreground">{c.student_no || ""}</span></div>
                            <div className="truncate text-[11px] text-muted-foreground">{[c.department, c.class_name].filter(Boolean).join(" · ") || "—"}</div>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </button>
                      ))}
                    </div>
                  )}

                  {m.stats && typeof m.stats.value !== "undefined" && (
                    <div className="rounded-md border bg-card p-3 text-xs">
                      <div className="text-muted-foreground">
                        {METRIC_LABELS[m.stats.metric] ?? "统计结果"}
                        {m.stats.range_label ? <span className="ml-1">· {m.stats.range_label}</span> : null}
                      </div>
                      {typeof m.stats.value === "object" && m.stats.value !== null ? (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {Object.entries(m.stats.value as Record<string, number>).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between">
                              <span className="text-muted-foreground">{STATUS_LABELS[k] ?? k}</span>
                              <span className="font-semibold">{v}</span>
                            </div>
                          ))}
                          {typeof m.stats.total === "number" && (
                            <div className="mt-1 flex items-center justify-between border-t pt-1">
                              <span className="text-muted-foreground">合计</span>
                              <span className="font-semibold">{m.stats.total}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-2xl font-bold">{String(m.stats.value)}</div>
                      )}
                    </div>
                  )}

                  {m.stats && Array.isArray((m.stats as any).items) && (m.stats as any).items.length > 0 && (
                    <div className="w-full max-w-[95%] rounded-md border bg-card p-3 text-xs">
                      <div className="mb-2 font-medium">
                        {(m.stats as any).range_label ? `${(m.stats as any).range_label} · ` : ""}
                        共 {(m.stats as any).count} 条申请
                        {typeof (m.stats as any).distinct_students === "number" ? `（${(m.stats as any).distinct_students} 名学生）` : ""}
                      </div>
                      <div className="flex flex-col gap-2">
                        {(m.stats as any).items.map((it: Record<string, any>, idx: number) => (
                          <div key={idx} className="rounded border bg-muted/30 p-2">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-semibold">{it.姓名}</span>
                              <span className="text-muted-foreground">{it.学号}</span>
                              <span className="text-muted-foreground">· {it.所属学院}</span>
                              <span className="text-muted-foreground">· {it.班级}</span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {it.提交时间} · {it.状态} · 编号 {it.申请编号末8位}
                            </div>
                            {it.申请描述 ? (
                              <div className="mt-0.5 line-clamp-2 text-[11px]">{it.申请描述}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {m.action?.type === "navigate" && m.action.payload?.path && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { navigate(m.action!.payload.path); }}>
                      {labelForPath(m.action.payload.path)} <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              {loading && (
                <div className="self-start flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> 思考中…
                </div>
              )}
        </div>
      </div>

      <div className="border-t px-3 py-2">
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="例如：调出张三的档案 / 查看不合格学生"
                rows={2}
                className="min-h-[44px] resize-none text-sm"
                disabled={loading}
              />
              <Button size="icon" onClick={() => sendMessage(input)} disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
      </div>
    </div>
  );
};

export default StaffAiAssistant;
