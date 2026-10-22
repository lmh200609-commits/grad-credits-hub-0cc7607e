import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AssistantMessage, { type Section } from "@/components/AssistantMessage";

type Msg = { role: "user" | "assistant"; content: string; sections?: Section[] | null; polished?: boolean };

const WELCOME: Msg = {
  role: "assistant",
  content:
    "您好，我是学分认定规则助手。\n\n为帮您准确匹配规则，请按【关键词】方式描述，例如：\n• 成果类型：竞赛 / 证书 / 论文 / 专利 / 创新创业…\n• 名称全称：如「全国大学生英语竞赛」\n• 级别：国家级 / 省级 / 校级 / 国际级\n• 等级/角色：一等奖 / 三等奖 / 第一作者 / 团队成员\n• 其他补充：举办单位、年份等\n\n示例：竞赛 + 全国大学生数学建模竞赛 + 国家级 + 二等奖 + 团队成员\n\n我只依据规则库与案例库做解释，不做最终审批。",
};

const KEYWORD_CHIPS = ["成果类型", "名称", "级别", "等级/角色", "补充信息"];

const AiAssistant = () => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      // strip welcome message before sending; cap to last 20
      const history = next.filter((m) => m !== WELCOME).slice(-20);
      const { data, error } = await supabase.functions.invoke("ask-credit-assistant", {
        body: { messages: history },
      });
      if (error) throw error;
      const d = data as any;
      const answer = d?.answer || "（暂无回答）";
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: answer,
        sections: d?.sections ?? null,
        polished: !!d?.meta?.polished,
      }]);
    } catch (e: any) {
      toast({
        title: "助手暂时不可用",
        description: (/[\u4e00-\u9fa5]/.test(String(e?.message ?? "")) ? e.message : "请稍后再试"),
        variant: "destructive",
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "抱歉，服务暂时不可用，请稍后再试。" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const insertChip = (label: string) => {
    const ta = textareaRef.current;
    const snippet = `${label}：`;
    if (!ta) {
      setInput((prev) => (prev ? `${prev} ${snippet}` : snippet));
      return;
    }
    const start = ta.selectionStart ?? input.length;
    const end = ta.selectionEnd ?? input.length;
    const before = input.slice(0, start);
    const after = input.slice(end);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insertion = (needsSpace ? " " : "") + snippet;
    const next = before + insertion + after;
    setInput(next);
    const caret = (before + insertion).length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret);
      ta.scrollTop = ta.scrollHeight;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="打开学分规则助手"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
      >
        <Sparkles className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[calc(100vw-2rem)] max-w-[380px] flex-col rounded-xl border bg-background shadow-2xl sm:w-[380px]">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">学分规则助手</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-3 p-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}>
              {m.role === "user" ? (
                <div className="max-w-[85%]">
                  <AssistantMessage variant="user" content={m.content} />
                </div>
              ) : (
                <AssistantMessage content={m.content} sections={m.sections} polished={m.polished} />
              )}
            </div>
          ))}
          {loading && (
            <div className="self-start flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> 检索规则中…
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        {!loading && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {KEYWORD_CHIPS.map((c) => (
              <Button
                key={c}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => insertChip(c)}
              >
                {c}
              </Button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="竞赛 + 全国大学生英语竞赛 + 国家级 + 三等奖 + 个人参赛"
            rows={2}
            className="min-h-[44px] resize-none text-sm"
            disabled={loading}
          />
          <Button size="icon" onClick={send} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">仅供参考，不代表最终认定结果</p>
      </div>
    </div>
  );
};

export default AiAssistant;