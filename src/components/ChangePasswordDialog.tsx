import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { changeOwnPassword } from "@/lib/changePassword";

export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [cur, setCur] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr(null);
    const msg = await changeOwnPassword(cur, pwd, pwd2);
    setSaving(false);
    if (msg) { setErr(msg); return; }
    setCur(""); setPwd(""); setPwd2("");
    toast({ title: "密码已修改，请用新密码重新登录" });
    onDone?.();
    await signOut();
    navigate("/login", { replace: true });
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="cp-cur">当前密码</Label>
        <Input id="cp-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cp-new">新密码</Label>
        <Input id="cp-new" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">至少 8 位，须同时包含字母和数字</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cp-new2">确认新密码</Label>
        <Input id="cp-new2" type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
      </div>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
      <DialogFooter className="sm:justify-start">
        <Button type="submit" disabled={saving}>{saving ? "提交中…" : "确认修改"}</Button>
      </DialogFooter>
    </form>
  );
}

const ChangePasswordDialog = () => {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="修改密码">
          <KeyRound className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">修改密码</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>修改成功后需要用新密码重新登录</DialogDescription>
        </DialogHeader>
        {open && <ChangePasswordForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;
