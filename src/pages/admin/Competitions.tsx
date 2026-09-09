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
import { useAuth } from "@/hooks/useAuth";
import { toastErrorLegacy } from "@/lib/errors";
import { COMPETITION_CATEGORIES, LEVEL_TIERS, type CompetitionEntry } from "@/lib/catalog";

type Draft = {
  id?: string;
  name: string;
  aliasText: string;
  category: string;
  default_level: string;
  default_credit: string;
  note: string;
  active: boolean;
};

const emptyDraft: Draft = {
  name: "", aliasText: "", category: "学科竞赛", default_level: "", default_credit: "", note: "", active: true,
};

const CompetitionsPage = () => {
  const { collegeId } = useAuth();
  const [items, setItems] = useState<CompetitionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competition_catalog").select("*").order("name");
    if (error) toastErrorLegacy(error, "加载失败");
    const all = (data ?? []) as any[];
    const scoped = collegeId ? all.filter((r) => r.college_id === collegeId) : all.filter((r) => r.college_id == null);
    setItems(scoped as unknown as CompetitionEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [collegeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((e) =>
      e.name.toLowerCase().includes(q) ||
      (e.aliases ?? []).some((a) => a.toLowerCase().includes(q)) ||
      (e.category ?? "").toLowerCase().includes(q));
  }, [items, search]);

  const openNew = () => { setDraft(emptyDraft); setOpen(true); };
  const openEdit = (e: CompetitionEntry) => {
    setDraft({
      id: e.id, name: e.name, aliasText: (e.aliases ?? []).join("、"),
      category: e.category ?? "学科竞赛", default_level: e.default_level ?? "",
      default_credit: e.default_credit != null ? String(e.default_credit) : "",
      note: e.note ?? "", active: e.active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) { toast.error("请填写赛事名称"); return; }
    setSaving(true);
    const payload = {
      name: draft.name.trim(),
      aliases: draft.aliasText.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean),
      category: draft.category,
      default_level: draft.default_level || null,
      default_credit: draft.default_credit ? Number(draft.default_credit) : null,
      note: draft.note || null,
      active: draft.active,
    };
    const { error } = draft.id
      ? await supabase.from("competition_catalog").update(payload).eq("id", draft.id)
      : await supabase.from("competition_catalog").insert({ ...payload, college_id: collegeId });
    setSaving(false);
    if (error) { toastErrorLegacy(error, "保存失败"); return; }
    toast.success("已保存");
    setOpen(false);
    load();
  };

  const toggle = async (e: CompetitionEntry) => {
    const { error } = await supabase.from("competition_catalog").update({ active: !e.active }).eq("id", e.id);
    if (error) { toastErrorLegacy(error, "操作失败"); return; }
    load();
  };

  const remove = async (e: CompetitionEntry) => {
    if (!confirm(`确定删除「${e.name}」？`)) return;
    const { error } = await supabase.from("competition_catalog").delete().eq("id", e.id);
    if (error) { toastErrorLegacy(error, "删除失败"); return; }
    toast.success("已删除");
    load();
  };

  return (
    <AppLayout>
      <PageHeader title="赛事名录" description="维护认可赛事及其简称，学生填写时系统据此识别赛事与级别；名录外的项目显示「待核对」，由教师人工认定。" />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="搜索赛事名称或简称" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />新增赛事</Button>
          </div>

          {loading ? <div className="space-y-2">{[0,1,2,3,4].map((i) => (<div key={i} className="h-10 animate-pulse rounded-md bg-muted" />))}</div> : filtered.length === 0 ? (
            <EmptyState title="暂无赛事" description="点击「新增赛事」添加认可的比赛名称与简称。" />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>赛事名称</TableHead>
                  <TableHead>简称 / 别名</TableHead>
                  <TableHead>大类</TableHead>
                  <TableHead>默认级别</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.name}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <div className="flex flex-wrap gap-1">
                          {(e.aliases ?? []).map((a, i) => <Badge key={`${a}-${i}`} variant="secondary">{a}</Badge>)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{e.category}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.default_level ?? "—"}</TableCell>
                      <TableCell>
                        <Switch checked={e.active} onCheckedChange={() => toggle(e)} />
                      </TableCell>
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
          <DialogHeader><DialogTitle>{draft.id ? "编辑赛事" : "新增赛事"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>赛事名称</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="如：中国国际大学生创新大赛" /></div>
            <div>
              <Label>简称 / 别名（用「、」分隔）</Label>
              <Textarea value={draft.aliasText} onChange={(e) => setDraft({ ...draft, aliasText: e.target.value })} placeholder="互联网+、国创赛、建行杯" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>大类</Label>
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                  {COMPETITION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <Label>默认级别（可空）</Label>
                <select className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={draft.default_level} onChange={(e) => setDraft({ ...draft, default_level: e.target.value })}>
                  <option value="">按学生填写</option>
                  {LEVEL_TIERS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div><Label>默认学分（可空）</Label><Input type="number" step="0.5" value={draft.default_credit} onChange={(e) => setDraft({ ...draft, default_credit: e.target.value })} /></div>
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

export default CompetitionsPage;
