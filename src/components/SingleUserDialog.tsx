import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { toast } from "sonner";
import { buildPassword, type ParsedRow } from "@/lib/parseRoster";
import { YmdPicker } from "@/components/ui/ymd-picker";
import { displayError } from "@/lib/displayText";

type Props = {
  open: boolean;
  role: "student" | "teacher";
  onClose: () => void;
  onDone: () => void;
};

const CURRENT_YEAR = new Date().getFullYear();

const SingleUserDialog = ({ open, role, onClose, onDone }: Props) => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [callerCollegeName, setCallerCollegeName] = useState<string | null>(null);
  const [colleges, setColleges] = useState<{ id: string; name: string }[]>([]);
  const [collegeId, setCollegeId] = useState<string>(""); // for super-admin selection
  const [submitting, setSubmitting] = useState(false);

  const empty = {
    student_no: "", full_name: "", phone: "", gender: "",
    ethnicity: "", political_status: "", birth_date: "",
    department: "", major: "", class_name: "",
    enrollment_year: "", advisor: "",
    apartment_no: "", dorm_room: "", bed_no: "",
  };
  const [f, setF] = useState(empty);

  useEffect(() => {
    if (!open) return;
    setF(empty);
    setCollegeId("");
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const { data: roles } = await supabase
        .from("user_roles").select("role, college_id")
        .eq("user_id", uid).in("role", ["admin", "super_admin"]);
      const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
      setIsSuperAdmin(isSuper);
      if (isSuper) {
        const { data: cs } = await supabase
          .from("colleges").select("id, name").eq("active", true).order("name");
        setColleges((cs as any) ?? []);
      } else {
        const cid = (roles ?? []).find((r) => r.role === "admin")?.college_id;
        if (cid) {
          const { data: c } = await supabase
            .from("colleges").select("name").eq("id", cid).maybeSingle();
          setCallerCollegeName((c as any)?.name ?? null);
        }
      }
    })();
  }, [open]);

  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }));

  const validate = (): string | null => {
    if (!f.student_no.trim()) return role === "student" ? "学号必填" : "工号必填";
    if (!f.full_name.trim()) return "姓名必填";
    if (role === "student") {
      if (!f.phone.trim()) return "手机号必填";
      if (!f.advisor.trim()) return "辅导员必填";
      if (!f.class_name.trim()) return "班级必填";
      if (!f.department.trim()) return "院系必填";
      if (!f.birth_date.trim()) return "出生日期必填";
      if (!f.gender.trim()) return "性别必填";
    } else {
      if (!f.phone.trim()) return "手机号必填";
    }
    if (f.phone) {
      const d = f.phone.replace(/\D+/g, "");
      if (d.length < 7 || d.length > 15) return "手机号位数异常（7-15 位）";
    }
    if (f.gender && !["男", "女"].includes(f.gender.trim())) return "性别只能是「男」或「女」";
    if (f.birth_date) {
      const m = f.birth_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return "出生日期请按年-月-日填写，例如 2004-09-01";
    }
    if (f.enrollment_year) {
      const y = Number(f.enrollment_year);
      if (!Number.isInteger(y) || y < 1990 || y > CURRENT_YEAR + 1) {
        return `年级应在 1990 - ${CURRENT_YEAR + 1} 之间`;
      }
    }
    if (isSuperAdmin && !collegeId) return "请选择归属学院";
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    const sno = f.student_no.trim();
    const phone = f.phone.trim() || undefined;
    const collegeName = isSuperAdmin
      ? colleges.find((c) => c.id === collegeId)?.name
      : callerCollegeName ?? undefined;
    const row: ParsedRow = {
      student_no: sno,
      full_name: f.full_name.trim(),
      role,
      phone,
      gender: f.gender.trim() || undefined,
      ethnicity: f.ethnicity.trim() || undefined,
      political_status: f.political_status.trim() || undefined,
      birth_date: f.birth_date.trim() || undefined,
      department: f.department.trim() || undefined,
      major: f.major.trim() || undefined,
      class_name: f.class_name.trim() || undefined,
      enrollment_year: f.enrollment_year ? Number(f.enrollment_year) : undefined,
      advisor: f.advisor.trim() || undefined,
      apartment_no: f.apartment_no.trim() || undefined,
      dorm_room: f.dorm_room.trim() || undefined,
      bed_no: f.bed_no.trim() || undefined,
      college_name: collegeName,
      password: buildPassword(sno, phone),
    };

    const { data, error } = await supabase.functions.invoke("import-users", {
      body: { rows: [row], file_name: "单条新增" },
    });
    setSubmitting(false);
    if (error || (data as any)?.error) {
      const ctx: any = (error as any)?.context;
      let detail = error?.message ?? (data as any)?.error;
      try {
        const t = await ctx?.text?.();
        if (t) {
          const j = JSON.parse(t);
          detail = j.errors?.[0]?.message ?? j.conflicts?.[0] ?? j.error ?? detail;
        }
      } catch {}
      toast.error(displayError(String(detail || "创建失败，请稍后重试")));
      return;
    }
    toast.success(`已创建账号：${f.full_name}（默认密码 = 学号 + 手机号后 6 位）`);
    onDone();
    onClose();
  };

  const idLabel = role === "student" ? "学号" : "工号";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建{role === "student" ? "学生" : "教师"}账号</DialogTitle>
          <DialogDescription>
            按导入模板填写。默认密码 = {idLabel} + 手机号后 6 位（不足左补 0）。
          </DialogDescription>
        </DialogHeader>

        {!isSuperAdmin && callerCollegeName && (
          <div className="rounded-md border bg-muted/40 p-2 text-xs">
            归属学院：<Badge variant="secondary">{callerCollegeName}</Badge>
            <span className="ml-2 text-muted-foreground">不可修改，跨学院请联系超级管理员</span>
          </div>
        )}

        <div className="grid max-h-[60vh] gap-3 overflow-y-auto px-1 py-1 sm:grid-cols-2">
          {isSuperAdmin && (
            <div className="sm:col-span-2">
              <Label>归属学院 <span className="text-destructive">*</span></Label>
              <SearchableSelect
                value={collegeId}
                onChange={setCollegeId}
                options={colleges.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="请选择学院"
                searchPlaceholder="搜索学院…"
              />
            </div>
          )}
          <Field req label={idLabel} value={f.student_no} onChange={(v) => set("student_no", v)} />
          <Field req label="姓名" value={f.full_name} onChange={(v) => set("full_name", v)} />
          <Field req={role === "student"} label="手机号" value={f.phone} onChange={(v) => set("phone", v)} placeholder="11 位手机号" />
          {role === "student" && (
            <>
              <Field req label="性别" value={f.gender} onChange={(v) => set("gender", v)} placeholder="男 / 女" />
              <div>
                <Label>出生日期 <span className="text-destructive">*</span></Label>
                <YmdPicker
                  value={f.birth_date}
                  onChange={(v) => set("birth_date", v)}
                  disableFuture
                  fromYear={1940}
                  toYear={CURRENT_YEAR}
                />
              </div>
              <Field req label="辅导员" value={f.advisor} onChange={(v) => set("advisor", v)} />
              <Field req label="班级" value={f.class_name} onChange={(v) => set("class_name", v)} />
              <Field req label="院系" value={f.department} onChange={(v) => set("department", v)} />
              <Field label="专业" value={f.major} onChange={(v) => set("major", v)} />
              <Field label="年级（入学年份）" value={f.enrollment_year} onChange={(v) => set("enrollment_year", v)} placeholder="例如 2024" />
              <Field label="民族" value={f.ethnicity} onChange={(v) => set("ethnicity", v)} />
              <Field label="政治面貌" value={f.political_status} onChange={(v) => set("political_status", v)} />
              <Field label="公寓号" value={f.apartment_no} onChange={(v) => set("apartment_no", v)} />
              <Field label="宿舍号" value={f.dorm_room} onChange={(v) => set("dorm_room", v)} />
              <Field label="床号" value={f.bed_no} onChange={(v) => set("bed_no", v)} />
            </>
          )}
          {role === "teacher" && (
            <>
              <Field label="性别" value={f.gender} onChange={(v) => set("gender", v)} placeholder="男 / 女" />
              <Field label="院系" value={f.department} onChange={(v) => set("department", v)} />
              <div>
                <Label>出生日期</Label>
                <YmdPicker
                  value={f.birth_date}
                  onChange={(v) => set("birth_date", v)}
                  disableFuture
                  fromYear={1940}
                  toYear={CURRENT_YEAR}
                />
              </div>
              <Field label="民族" value={f.ethnicity} onChange={(v) => set("ethnicity", v)} />
              <Field label="政治面貌" value={f.political_status} onChange={(v) => set("political_status", v)} />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "创建中…" : "创建账号"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({
  label, value, onChange, placeholder, req,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; req?: boolean }) => (
  <div>
    <Label>{label}{req && <span className="text-destructive"> *</span>}</Label>
    <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

export default SingleUserDialog;