import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, PlugZap, CheckCircle2, XCircle, Loader2, Cpu } from "lucide-react";
import { toastErrorLegacy } from "@/lib/errors";
import { displayError } from "@/lib/displayText";

const VENDOR_PRESETS = [
  { vendor: "deepseek", label: "DeepSeek 深度求索", baseUrl: "https://api.deepseek.com/v1", sample: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"] },
  { vendor: "qwen",     label: "阿里通义千问 DashScope", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", sample: "qwen-plus",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen3-vl-32b-thinking"] },
  { vendor: "zhipu",    label: "智谱 GLM",                 baseUrl: "https://open.bigmodel.cn/api/paas/v4", sample: "glm-4-plus",
    models: ["glm-4-plus", "glm-4-flash", "glm-4-air"] },
  { vendor: "kimi",     label: "月之暗面 Kimi",            baseUrl: "https://api.moonshot.cn/v1", sample: "moonshot-v1-8k",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"] },
  { vendor: "wenxin",   label: "百度文心 千帆",            baseUrl: "https://qianfan.baidubce.com/v2", sample: "ernie-4.5-turbo-128k",
    models: ["ernie-4.5-turbo-128k", "ernie-4.0-turbo-8k"] },
  { vendor: "custom",   label: "自定义 OpenAI 兼容",       baseUrl: "", sample: "",
    models: [] as string[] },
] as const;

const FUNCTION_LABELS: Record<string, { label: string; desc: string }> = {
  "evaluate-application": { label: "学生端 · AI 初审", desc: "学生提交申请后自动核验材料、关键词、身份。" },
  "ai-parse-roster":      { label: "管理员 · 批量导入解析", desc: "识别 Excel/CSV 表头并映射到学号/姓名等字段。" },
  "ai-explain-import":    { label: "管理员 · 导入失败诊断", desc: "对导入失败做原因聚类与中文修复建议。" },
  "import-assistant-chat":{ label: "管理员 · 导入助手对话", desc: "导入页面右下角的助手问答。" },
  "staff-ai-assistant":   { label: "管理员/教师 · 工作助手", desc: "教师与管理员侧边栏的 AI 工作助手。" },
  "ask-credit-assistant": { label: "学生端 · 学分问答", desc: "学生端的学分认定规则问答助手。" },
  "polish-answer":        { label: "全局 · 回答排版润色", desc: "为助手输出做 Markdown 整洁化（可选）。" },
};

type Provider = {
  id: string; name: string; vendor: string; base_url: string;
  api_key_last4: string; note: string | null;
  created_at?: string; updated_at?: string;
};

type Binding = {
  function_key: string;
  model: string;
  provider_id: string | null;
  ai_providers: { id: string; name: string; vendor: string; base_url: string; api_key_last4: string } | null;
};

type EnvFallback = {
  vendor: string;
  baseUrl: string;
  providerName: string;
  defaultModel: string;
  envKey: string;
} | null;

async function callAdmin(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("ai-provider-admin", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

const maskKey = (last4: string) => last4 ? `••••••••${last4}` : "—";

const AiModelsPage = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [fallback, setFallback] = useState<EnvFallback>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const [pingState, setPingState] = useState<Record<string, { ok: boolean; latency: number; msg: string } | "loading">>({});

  const load = async () => {
    setLoading(true);
    try {
      const [p, b] = await Promise.all([callAdmin("list_providers"), callAdmin("list_bindings")]);
      setProviders(p.providers || []);
      setBindings(b.bindings || []);
      setFallback(b.fallback ?? null);
    } catch (e) {
      toastErrorLegacy(e, "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onTestProvider = async (providerId: string, model: string) => {
    setPingState((s) => ({ ...s, [providerId]: "loading" }));
    try {
      const r = await callAdmin("test_provider", { provider_id: providerId, model });
      setPingState((s) => ({ ...s, [providerId]: { ok: !!r.ok, latency: r.latency_ms, msg: r.ok ? "连接成功" : displayError(String(r.error || `服务响应异常（状态码 ${r.status}）`)) } }));
    } catch (e) {
      setPingState((s) => ({ ...s, [providerId]: { ok: false, latency: 0, msg: displayError((e as Error).message) } }));
    }
  };

  const onDeleteProvider = async (id: string) => {
    const used = bindings.find((b) => b.provider_id === id);
    if (used) {
      toast({ title: "无法删除", description: `该提供商正被「${FUNCTION_LABELS[used.function_key]?.label ?? "系统功能"}」使用，请先解绑。`, variant: "destructive" });
      return;
    }
    if (!confirm("确认删除此提供商？")) return;
    try {
      await callAdmin("delete_provider", { id });
      toast({ title: "已删除" });
      load();
    } catch (e) {
      toastErrorLegacy(e, "删除失败");
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="AI 模型设置"
          description="配置系统内部 AI 调用使用的中国厂商模型。每个功能可单独绑定不同提供商。所有 API 密钥 加密存储，前端不可见。"
          actions={
            <Button onClick={() => { setEditing(null); setProviderOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> 新增提供商
            </Button>
          }
        />

        {/* Provider list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" /> 提供商凭据
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">加载中…</div>
            ) : providers.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                还未添加任何提供商。点击右上角"新增提供商"开始配置（推荐先添加 DeepSeek 或通义千问）。
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>厂商</TableHead>
                    <TableHead>接口地址</TableHead>
                    <TableHead>API 密钥</TableHead>
                    <TableHead>测试</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((p) => {
                    const ps = pingState[p.id];
                    const preset = VENDOR_PRESETS.find((v) => v.vendor === p.vendor);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell><Badge variant="outline">{preset?.label ?? p.vendor}</Badge></TableCell>
                        <TableCell className="max-w-[260px] truncate font-mono text-xs">{p.base_url}</TableCell>
                        <TableCell className="font-mono text-xs">{maskKey(p.api_key_last4)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm" variant="outline"
                              onClick={() => onTestProvider(p.id, preset?.sample || "deepseek-chat")}
                              disabled={ps === "loading"}
                            >
                              {ps === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                              <span className="ml-1">测试</span>
                            </Button>
                            {ps && ps !== "loading" && (
                              <span className={`flex items-center gap-1 text-xs ${ps.ok ? "text-green-600" : "text-destructive"}`}>
                                {ps.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                {ps.ok ? `${ps.latency} 毫秒` : ps.msg.slice(0, 60)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setProviderOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => onDeleteProvider(p.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Function bindings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">功能与模型绑定</CardTitle>
            <p className="text-sm text-muted-foreground">
              下表显示系统中每个 AI 功能 <b>当前实际调用的提供商与模型</b>。未绑定提供商时，系统会自动回退到环境变量密钥。
            </p>
            {fallback && (
              <div className="mt-2 rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                <b>当前回退渠道：</b>{fallback.providerName} · 走 <code className="font-mono">{fallback.envKey}</code> · {fallback.baseUrl}
              </div>
            )}
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!confirm("将根据环境变量 Key 创建/更新 DashScope + DeepSeek 提供商，并把 7 个功能按默认清单（evaluate→qwen3-vl-32b-thinking, parse→qwen-plus, explain/import→qwen-turbo, staff/ask/polish→deepseek-chat）一键绑定。是否继续？")) return;
                  try {
                    const r = await callAdmin("restore_defaults");
                    toast({ title: "已按默认清单恢复绑定" });
                    console.log("restore_defaults:", r);
                    load();
                  } catch (e) {
                    toastErrorLegacy(e, "恢复失败");
                  }
                }}
              >
                一键恢复默认模型绑定
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>功能</TableHead>
                  <TableHead>当前实际调用</TableHead>
                  <TableHead>提供商 + 模型（自动保存）</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bindings.map((b) => (
                  <BindingRow
                    key={b.function_key}
                    binding={b}
                    providers={providers}
                    fallback={fallback}
                    onSaved={load}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ProviderDialog
        open={providerOpen}
        onOpenChange={setProviderOpen}
        editing={editing}
        onSaved={() => { setProviderOpen(false); load(); }}
      />
    </AppLayout>
  );
};

/* ----------------- Binding row ----------------- */
const BindingRow = ({
  binding, providers, fallback, onSaved,
}: { binding: Binding; providers: Provider[]; fallback: EnvFallback; onSaved: () => void }) => {
  const [saving, setSaving] = useState(false);
  const [customDraft, setCustomDraft] = useState("");
  const [editingCustom, setEditingCustom] = useState(false);

  const meta = FUNCTION_LABELS[binding.function_key] ?? { label: "其他系统功能", desc: "" };
  const providerId = binding.provider_id ?? "__none__";
  const currentProvider = providers.find((p) => p.id === binding.provider_id);
  const isBound = !!binding.provider_id && !!binding.ai_providers;
  const activeName = isBound ? binding.ai_providers!.name : (fallback?.providerName ?? "未配置");
  const activeBase = isBound ? binding.ai_providers!.base_url : (fallback?.baseUrl ?? "—");
  const activeModel = binding.model || fallback?.defaultModel || "—";

  const vendor = currentProvider?.vendor ?? fallback?.vendor ?? "deepseek";
  const vendorPreset = VENDOR_PRESETS.find((v) => v.vendor === vendor);
  const presetModels: string[] = vendorPreset ? [...vendorPreset.models] : [];
  const modelOptions = Array.from(new Set([binding.model, ...presetModels].filter(Boolean)));
  const isCustomActive = !!binding.model && !modelOptions.slice(1).includes(binding.model) && !presetModels.includes(binding.model);
  const showCustomInput = editingCustom || isCustomActive;

  const persist = async (nextProviderId: string | null, nextModel: string) => {
    setSaving(true);
    try {
      await callAdmin("upsert_binding", {
        function_key: binding.function_key,
        provider_id: nextProviderId,
        model: nextModel.trim() || binding.model,
      });
      toast({ title: "已更新", description: `${meta.label} → ${nextModel}` });
      setEditingCustom(false);
      setCustomDraft("");
      onSaved();
    } catch (e) {
      toastErrorLegacy(e, "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onProviderChange = (nextId: string) => {
    const realId = nextId === "__none__" ? null : nextId;
    const nextProvider = providers.find((p) => p.id === realId);
    const nextVendor = nextProvider?.vendor ?? fallback?.vendor ?? "deepseek";
    const nextPreset = VENDOR_PRESETS.find((v) => v.vendor === nextVendor);
    const stillValid = nextPreset?.models.some((m) => m === binding.model);
    const nextModel = stillValid ? binding.model : (nextPreset?.sample || binding.model);
    persist(realId, nextModel);
  };

  const onModelChange = (next: string) => {
    if (next === "__custom__") { setEditingCustom(true); setCustomDraft(binding.model); return; }
    persist(binding.provider_id, next);
  };

  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="font-medium">{meta.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{meta.desc}</div>
      </TableCell>
      <TableCell className="max-w-[260px] align-top">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={isBound ? "default" : "secondary"}>{isBound ? "已绑定" : "环境回退"}</Badge>
          <span className="truncate text-sm font-medium" title={activeName}>{activeName}</span>
        </div>
        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={activeBase}>{activeBase}</div>
        <div className="mt-0.5 font-mono text-[11px]">{activeModel}</div>
      </TableCell>
      <TableCell className="min-w-[340px] align-top">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchableSelect
            value={providerId}
            onChange={onProviderChange}
            disabled={saving}
            options={[
              { value: "__none__", label: "未绑定（环境回退）" },
              ...providers.map((p) => ({ value: p.id, label: `${p.name} · ${p.vendor}` })),
            ]}
            placeholder="未绑定（环境变量）"
            searchPlaceholder="搜索 Provider…"
            className="sm:w-[180px]"
          />
          <SearchableSelect
            value={showCustomInput ? "__custom__" : binding.model}
            onChange={onModelChange}
            disabled={saving}
            options={[
              ...modelOptions.map((m) => ({ value: m, label: m })),
              { value: "__custom__", label: "自定义模型名…" },
            ]}
            placeholder="选择模型"
            searchPlaceholder="搜索模型…"
            className="font-mono text-xs sm:w-[180px]"
          />
        </div>
        {showCustomInput && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={customDraft}
              placeholder="输入模型名（如 deepseek-chat）"
              className="font-mono text-xs"
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customDraft.trim()) persist(binding.provider_id, customDraft.trim());
              }}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={saving || !customDraft.trim() || customDraft.trim() === binding.model}
              onClick={() => persist(binding.provider_id, customDraft.trim())}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "保存"}
            </Button>
          </div>
        )}
        {currentProvider && (
          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{currentProvider.base_url}</div>
        )}
      </TableCell>
    </TableRow>
  );
};

/* ----------------- Provider dialog ----------------- */
const ProviderDialog = ({
  open, onOpenChange, editing, onSaved,
}: { open: boolean; onOpenChange: (v: boolean) => void; editing: Provider | null; onSaved: () => void }) => {
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState<string>("deepseek");
  const [baseUrl, setBaseUrl] = useState<string>(VENDOR_PRESETS[0].baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; latency?: number } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) {
      setTestResult(null);
      if (editing) {
        setName(editing.name);
        setVendor(editing.vendor);
        setBaseUrl(editing.base_url);
        setNote(editing.note ?? "");
        setApiKey("");
      } else {
        setName("");
        setVendor("deepseek");
        setBaseUrl(VENDOR_PRESETS[0].baseUrl);
        setApiKey("");
        setNote("");
      }
    }
  }, [open, editing]);

  const onVendorChange = (v: string) => {
    setVendor(v);
    const preset = VENDOR_PRESETS.find((p) => p.vendor === v);
    if (preset && preset.baseUrl) setBaseUrl(preset.baseUrl);
  };

  const test = async () => {
    if (!baseUrl) { toast({ title: "请填写接口地址", variant: "destructive" }); return; }
    if (!apiKey && !editing) { toast({ title: "请填写 API 密钥", variant: "destructive" }); return; }
    setTesting(true); setTestResult(null);
    try {
      const preset = VENDOR_PRESETS.find((p) => p.vendor === vendor);
      const payload: any = { base_url: baseUrl, model: preset?.sample || "deepseek-chat" };
      if (apiKey) payload.api_key = apiKey;
      else if (editing) payload.provider_id = editing.id;
      const r = await callAdmin("test_provider", payload);
      setTestResult({ ok: !!r.ok, msg: r.ok ? "连接成功" : displayError(String(r.error || `服务响应异常（状态码 ${r.status}）`)), latency: r.latency_ms });
    } catch (e) {
      setTestResult({ ok: false, msg: displayError((e as Error).message) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!name.trim()) { toast({ title: "请填写名称", variant: "destructive" }); return; }
    if (!baseUrl.trim()) { toast({ title: "请填写接口地址", variant: "destructive" }); return; }
    if (!editing && !apiKey.trim()) { toast({ title: "请填写 API 密钥", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await callAdmin("upsert_provider", {
        id: editing?.id,
        name: name.trim(),
        vendor,
        base_url: baseUrl.trim(),
        api_key: apiKey.trim() || undefined,
        note: note.trim() || null,
      });
      toast({ title: editing ? "已更新" : "已创建" });
      onSaved();
    } catch (e) {
      toastErrorLegacy(e, "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "编辑提供商" : "新增提供商"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：我的 DeepSeek" />
          </div>
          <div>
            <Label>厂商预设</Label>
            <Select value={vendor} onValueChange={onVendorChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VENDOR_PRESETS.map((p) => (
                  <SelectItem key={p.vendor} value={p.vendor}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>接口地址</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">不要在末尾加 <code>/chat/completions</code>，系统会自动拼接。</p>
          </div>
          <div>
            <Label>API 密钥 {editing && <span className="ml-2 text-xs text-muted-foreground">已保存（如需更换请输入新密钥后保存）</span>}</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={editing ? `已保存 ••••••••${editing.api_key_last4}` : "sk-..."}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-muted-foreground">API 密钥加密存储于数据库，仅服务端调用模型时使用，绝不返回前端。</p>
          </div>
          <div>
            <Label>备注（可选）</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          {testResult && (
            <div className={`rounded-md p-2 text-xs ${testResult.ok ? "bg-green-50 text-green-700" : "bg-destructive/10 text-destructive"}`}>
              {testResult.ok ? <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> : <XCircle className="mr-1 inline h-3.5 w-3.5" />}
              {testResult.msg}{testResult.latency ? ` · ${testResult.latency} 毫秒` : ""}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={test} disabled={testing}>
            {testing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PlugZap className="mr-1 h-3.5 w-3.5" />}
            测试连接
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AiModelsPage;