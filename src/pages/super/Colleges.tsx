import { useEffect, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import EmptyState from "@/components/EmptyState";
import { toastError } from "@/lib/errors";

type College = {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  system_title: string;
  badge_url: string | null;
  active: boolean;
};

const emptyForm = { name: "", system_title: "长春财经学院国际经济贸易学院本科生创新实践学分认定系统" };

const Colleges = () => {
  const [rows, setRows] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<College | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<College | null>(null);
  const [pendingDelete, setPendingDelete] = useState<College | null>(null);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_college" as never, { _college: pendingDelete.id } as never);
    setDeleting(false);
    setPendingDelete(null);
    if (error) { toast.error(error.message || "删除失败"); return; }
    toast.success("学院已删除");
    void load();
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("colleges").select("*").order("created_at", { ascending: false });
    setRows((data as College[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  };

  const openEdit = (c: College) => {
    setEditing(c);
    setForm({ name: c.name, system_title: c.system_title });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("名称必填");
      return;
    }
    setSaving(true);
    const base = {
      name: form.name.trim(),
      system_title: form.system_title.trim() || "长春财经学院国际经济贸易学院本科生创新实践学分认定系统",
    };
    const { error } = editing
      ? await supabase.from("colleges").update(base).eq("id", editing.id)
      : await supabase.from("colleges").insert({
          ...base,
          code: `C${Date.now().toString(36).toUpperCase()}`,
        });
    setSaving(false);
    if (error) { toastError(error); return; }
    toast.success(editing ? "已更新" : "学院已创建");
    setOpen(false);
    void load();
  };

  const setActive = async (c: College, next: boolean) => {
    const { error } = await supabase.from("colleges").update({ active: next }).eq("id", c.id);
    if (error) toastError(error); else { toast.success(next ? "已启用" : "已停用"); void load(); }
  };
  const requestToggle = (c: College) => {
    if (c.active) setPendingDisable(c);
    else void setActive(c, true);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">学院管理</h1>
          <Button size="sm" onClick={openCreate}>新增学院</Button>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "编辑学院" : "新增学院"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>名称 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 信息工程学院" />
              </div>
              <div>
                <Label>系统标题</Label>
                <Input value={form.system_title} onChange={(e) => setForm({ ...form, system_title: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">主题与院徽由该学院的管理员在「品牌设置」中配置。</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button onClick={submit} disabled={saving}>{saving ? "保存中…" : "保存"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader><CardTitle className="text-base">共 {rows.length} 个学院</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>名称</TableHead><TableHead>系统标题</TableHead>
                <TableHead>院徽</TableHead><TableHead>启用</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={5}>加载中…</TableCell></TableRow>
                  : rows.length === 0 ? <TableRow><TableCell colSpan={5}><EmptyState title="暂无学院" description="点击右上角「新增学院」开始" /></TableCell></TableRow>
                  : rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{c.system_title}</TableCell>
                      <TableCell>{c.badge_url ? <img src={c.badge_url} alt="" className="h-8 w-8 rounded" /> : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={c.active} onCheckedChange={() => requestToggle(c)} />
                          <span className="text-xs text-muted-foreground">{c.active ? "启用中" : "已停用"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}>编辑</Button>
                          <Button size="sm" variant="destructive" onClick={() => setPendingDelete(c)}>删除</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <AlertDialog open={!!pendingDisable} onOpenChange={(o) => !o && setPendingDisable(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>停用学院 “{pendingDisable?.name}”？</AlertDialogTitle>
              <AlertDialogDescription>
                停用后，该学院的管理员、教师、学生将无法使用本系统。数据保留，可随时重新启用。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (pendingDisable) { void setActive(pendingDisable, false); setPendingDisable(null); } }}>
                确认停用
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除学院 “{pendingDelete?.name}”？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后不能恢复。学院下还有账号或申请时系统会拒绝删除，请改为停用。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction disabled={deleting} onClick={(e) => { e.preventDefault(); void doDelete(); }}>
                {deleting ? "删除中…" : "确认删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
};

export default Colleges;
