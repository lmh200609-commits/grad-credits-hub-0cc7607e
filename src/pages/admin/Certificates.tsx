import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Search, Pencil } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { toastErrorLegacy } from "@/lib/errors";
import { CERT_CLASSES, type CertificateEntry } from "@/lib/catalog";

type Draft = {
  id?: string;
  name: string;
  aliasText: string;
  cert_class: string;
  level: string;
  issuer: string;
  default_credit: string;
  note: string;
  active: boolean;
};

const emptyDraft: Draft = {
  name: "", aliasText: "", cert_class: "职业资格证书", level: "", issuer: "",
  default_credit: "", note: "", active: true,
};

const CertificatesPage = () => {
  const { collegeId } = useAuth();
  const [items, setItems] = useState<CertificateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("certificate_catalog").select("*").order("cert_class").order("name");
    if (error) toastErrorLegacy(error, "加载失败");
    setItems(((data ?? []) as unknown as CertificateEntry[]));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
      (e.issuer ?? "").toLowerCase().includes(q) ||
      (e.cert_class ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const openNew = () => { setDraft(emptyDraft); setOpen(true); };
  const openEdit = (e: CertificateEntry) => {
    setDraft({
      id: e.id, name: e.name, aliasText: (e.aliases ?? []).join("、"),
      cert_class: e.cert_class ?? "职业资格证书", level: e.level ?? "", issuer: e.issuer ?? "",
      default_credit: e.default_credit != null ? String(e.default_credit) : "",
      note: e.note ?? "", active: e.active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) { toast.error("请填写证书名称"); return; }
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      aliases: draft.aliasText.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean),
      cert_class: draft.cert_class,
      level: draft.level || null,
      issuer: draft.issuer || null,
      default_credit: draft.default_credit ? Number(draft.default_credit) : null,
      note: draft.note || null,
      active: draft.active,
    };
    const { error } = draft.id
      ? await supabase.from("certificate_catalog").update(payload).eq("id", draft.id)
      : await supabase.from("certificate_catalog").insert({ ...payload, college_id: collegeId });
    setSaving(false);
    if (error) { toastErrorLegacy(error, "保存失败"); return; }
    toast.success("已保存");
    setOpen(false);
    load();
  };

  const toggle = async (e: CertificateEntry) => {
    const { error } = await supabase.from("certificate_catalog").update({ active: !e.active }).eq("id", e.id);
    if (error) { toastErrorLegacy(error, "操作失败"); return; }
    load();
  };

  const remove = async (e: CertificateEntry) => {
    if (!confirm(`确定删除「${e.name}」？`)) return;
    const { error } = await supabase.from("certificate_catalog").delete().eq("id", e.id);
    if (error) { toastErrorLegacy(error, "删除失败"); return; }
    toast.success("已删除");
    load();
  };

  return (
    <AppLayout>
      <PageHeader
        title="证书名录"
        description="维护认可的证书清单：国家职业资格目录内为「职业资格证书」，目录外且与专业相关为「从业资格证书」，培训结课类为「专业从业培训证书」，其余归入「其他」由教师人工认定。"
      />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="搜索证书名称、发证单位或类别" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />新增证书</Button>
          </div>

          {loading ? <TableSkeleton /> : filtered.length === 0 ? (
            <EmptyState title="暂无证书" description="点击「新增证书」添加认可的证书名称。" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>证书名称</TableHead>
                  <TableHead>别名</TableHead>
                  <TableHead>类别</TableHead>
                  <TableHead>等级</TableHead>
                  <TableHead>发证单位</TableHead>
                  <TableHead className="text-right">学分</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="flex flex-wrap gap-1">
                          {(e.aliases ?? []).map((a, i) => <Badge key={`${a}-${i}`} variant="secondary">{a}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{e.cert_class}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.level ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={e.issuer ?? ""}>{e.issuer ?? "—"}</TableCell>
                      <TableCell className="text-right">{e.default_credit ?? "—"}</TableCell>
                      <TableCell><Switch checked={e.active} onCheckedChange={() => toggle(e)} /></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft.id ? "编辑证书" : "新增证书"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>证书名称</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="如：外经贸单证专业证书" /></div>
            <div>
              <Label>别名（用「、」分隔）</Label>
              <Textarea value={draft.aliasText} onChange={(e) => setDraft({ ...draft, aliasText: e.target.value })} placeholder="外经贸单证、单证员证书" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>类别</Label>
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.cert_class} onChange={(e) => setDraft({ ...draft, cert_class: e.target.value })}>
                  {CERT_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><Label>等级（可空）</Label><Input value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })} placeholder="初级 / 中级 / 高级" /></div>
            </div>
            <div><Label>发证单位</Label><Input value={draft.issuer} onChange={(e) => setDraft({ ...draft, issuer: e.target.value })} /></div>
            <div><Label>默认学分（可空，留空表示交教师核定）</Label><Input type="number" step="0.5" value={draft.default_credit} onChange={(e) => setDraft({ ...draft, default_credit: e.target.value })} /></div>
            <div><Label>备注</Label><Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={draft.active} onCheckedChange={(v) => setDraft({ ...draft, active: v })} /><span className="text-sm">启用</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default CertificatesPage;
