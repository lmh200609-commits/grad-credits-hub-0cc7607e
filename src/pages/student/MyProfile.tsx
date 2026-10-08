import { useCallback, useEffect, useRef, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, AlertCircle } from "lucide-react";
import { YmdPicker } from "@/components/ui/ymd-picker";
import { toastErrorLegacy } from "@/lib/errors";
import { missingProfileFields } from "@/lib/profileCompleteness";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Profile = {
  full_name: string | null;
  student_no: string | null;
  department: string | null;
  major: string | null;
  class_name: string | null;
  id_card: string | null;
  phone: string | null;
  school: string | null;
  photo_url: string | null;
  gender: string | null;
  ethnicity: string | null;
  political_status: string | null;
  birth_date: string | null;
  enrollment_year: number | null;
  advisor: string | null;
  apartment_no: string | null;
  dorm_room: string | null;
  bed_no: string | null;
  address: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
};

const MyProfile = () => {
  const { user, refreshProfile } = useAuth();
  const [idCardLocked, setIdCardLocked] = useState(false);
  const [p, setP] = useState<Profile | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("full_name, student_no, department, major, class_name, id_card, phone, school, photo_url, gender, ethnicity, political_status, birth_date, enrollment_year, advisor, apartment_no, dorm_room, bed_no, address, emergency_contact, emergency_phone")
      .eq("user_id", user.id)
      .maybeSingle();
    setP((data as Profile) ?? {
      full_name: "", student_no: "", department: "", major: "", class_name: "",
      id_card: "", phone: "", school: "长春财经学院", photo_url: null,
      gender: "", ethnicity: "", political_status: "", birth_date: "",
      enrollment_year: null, advisor: "", apartment_no: "", dorm_room: "", bed_no: "",
      address: "", emergency_contact: "", emergency_phone: "",
    });
    setIdCardLocked(!!(data as Profile | null)?.id_card?.trim());
    if ((data as Profile)?.photo_url) {
      const { data: signed } = await supabase.storage
        .from("application-files")
        .createSignedUrl((data as Profile).photo_url!, 3600);
      setPhotoUrl(signed?.signedUrl ?? null);
    } else {
      setPhotoUrl(null);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const changePassword = async () => {
    if (pwdSaving) return;
    if (!pwd || pwd.length < 6) {
      return toast({ title: "新密码至少 6 位", variant: "destructive" });
    }
    if (pwd !== pwd2) {
      return toast({ title: "两次输入的密码不一致", variant: "destructive" });
    }
    setPwdSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setPwdSaving(false);
    if (error) return toastErrorLegacy(error, "修改失败");
    setPwd(""); setPwd2("");
    toast({ title: "密码已更新" });
  };

  const setField = <K extends keyof Profile>(k: K, v: Profile[K]) =>
    setP((prev) => (prev ? { ...prev, [k]: v } : prev));

  const saveProfile = async () => {
    if (!user || !p || saving) return;
    const missing = missingProfileFields(p);
    if (missing.length > 0) {
      return toast({ title: `请填写：${missing.join("、")}`, variant: "destructive" });
    }
    if (p.phone) {
      const d = String(p.phone).replace(/\D+/g, "");
      if (d.length < 7 || d.length > 15) {
        return toast({ title: "手机号位数异常（7-15 位）", variant: "destructive" });
      }
    }
    if (p.emergency_phone) {
      const d = String(p.emergency_phone).replace(/\D+/g, "");
      if (d.length < 7 || d.length > 15) {
        return toast({ title: "紧急联系人电话位数异常", variant: "destructive" });
      }
    }
    if (p.gender && !["男", "女"].includes(p.gender.trim())) {
      return toast({ title: "性别只能是「男」或「女」", variant: "destructive" });
    }
    if (p.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(p.birth_date)) {
      return toast({ title: "出生日期格式应为 YYYY-MM-DD", variant: "destructive" });
    }
    if (p.enrollment_year != null && p.enrollment_year !== 0) {
      const y = Number(p.enrollment_year);
      const cy = new Date().getFullYear();
      if (!Number.isInteger(y) || y < 1990 || y > cy + 1) {
        return toast({ title: `年级应在 1990 - ${cy + 1} 之间`, variant: "destructive" });
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        ...(idCardLocked ? {} : { id_card: p.id_card?.trim() || null }),
        phone: p.phone || null,
        gender: p.gender || null,
        ethnicity: p.ethnicity || null,
        political_status: p.political_status || null,
        birth_date: p.birth_date || null,
        enrollment_year: p.enrollment_year ?? null,
        advisor: p.advisor || null,
        class_name: p.class_name || null,
        major: p.major || null,
        department: p.department || null,
        apartment_no: p.apartment_no || null,
        dorm_room: p.dorm_room || null,
        bed_no: p.bed_no || null,
        address: p.address || null,
        emergency_contact: p.emergency_contact || null,
        emergency_phone: p.emergency_phone || null,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) return toastErrorLegacy(error, "保存失败");
    toast({ title: "已保存" });
    await refreshProfile();
    load();
  };

  const missingList: string[] = missingProfileFields(p);

  const onPick = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user) return;
    if (!/^image\//.test(f.type)) {
      return toast({ title: "请选择图片", variant: "destructive" });
    }
    if (f.size > 5 * 1024 * 1024) {
      return toast({ title: "图片过大", description: "请小于 5MB", variant: "destructive" });
    }
    setUploading(true);
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
    const path = `student-photos/${user.id}/photo.${ext}`;
    const { error: ue } = await supabase.storage
      .from("application-files")
      .upload(path, f, { upsert: true, contentType: f.type });
    if (ue) {
      setUploading(false);
      return toastErrorLegacy(ue, "上传失败");
    }
    const { error: pe } = await supabase
      .from("profiles")
      .update({ photo_url: path })
      .eq("user_id", user.id);
    setUploading(false);
    if (pe) return toastErrorLegacy(pe, "保存失败");
    toast({ title: "照片已更新" });
    load();
  };

  if (!p) return <AppLayout><p>加载中…</p></AppLayout>;

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">我的档案</h1>
        {missingList.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              请先完善个人信息，完善后才能提交申请。还缺少：<span className="font-medium">{missingList.join("、")}</span>，补全后点击「保存修改」。
            </div>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">证件照</CardTitle>
            <CardDescription>用于学分认定证明，建议 1 寸或 2 寸正面免冠彩色照</CardDescription>
          </CardHeader>
          <CardContent className="flex items-start gap-4">
            <div className="h-40 w-32 overflow-hidden rounded border bg-muted/40">
              {photoUrl ? (
                <img src={photoUrl} alt="证件照" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  未上传
                </div>
              )}
            </div>
            <div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
              <Button onClick={onPick} disabled={uploading} variant="outline">
                <Upload className="mr-1 h-4 w-4" />
                {uploading ? "上传中…" : photoUrl ? "更换照片" : "上传照片"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本信息</CardTitle>
            <CardDescription>带 * 为必填。姓名、学号、学校由学校统一维护；身份证号首次填写保存后不可自行修改，如有错误请联系老师。</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Field label="姓名 *" v={p.full_name} />
            <Field label="学号" v={p.student_no} />
            <EField label="院系" v={p.department ?? ""} onChange={(v) => setField("department", v)} />
            <EField label="专业 *" v={p.major ?? ""} onChange={(v) => setField("major", v)} />
            <EField label="班级 *" v={p.class_name ?? ""} onChange={(v) => setField("class_name", v)} />
            <EField
              label="年级（入学年份）"
              v={p.enrollment_year != null ? String(p.enrollment_year) : ""}
              onChange={(v) => setField("enrollment_year", v ? Number(v) : null)}
              placeholder="例如 2024"
            />
            <div>
              <Label>性别 *</Label>
              <Select value={p.gender ?? ""} onValueChange={(v) => setField("gender", v)}>
                <SelectTrigger><SelectValue placeholder="请选择" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="男">男</SelectItem>
                  <SelectItem value="女">女</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <EField label="民族" v={p.ethnicity ?? ""} onChange={(v) => setField("ethnicity", v)} />
            <EField label="政治面貌" v={p.political_status ?? ""} onChange={(v) => setField("political_status", v)} />
            <div>
              <Label>出生日期</Label>
              <YmdPicker
                value={p.birth_date ?? ""}
                onChange={(v) => setField("birth_date", v || null)}
                disableFuture
                fromYear={1940}
                toYear={new Date().getFullYear()}
              />
            </div>
            <EField label="辅导员" v={p.advisor ?? ""} onChange={(v) => setField("advisor", v)} />
            {idCardLocked ? (
              <Field label="身份证号 *" v={p.id_card} />
            ) : (
              <EField label="身份证号 *" v={p.id_card ?? ""} onChange={(v) => setField("id_card", v)} />
            )}
            <EField label="手机号" v={p.phone ?? ""} onChange={(v) => setField("phone", v)} />
            <EField label="公寓号" v={p.apartment_no ?? ""} onChange={(v) => setField("apartment_no", v)} />
            <EField label="宿舍号" v={p.dorm_room ?? ""} onChange={(v) => setField("dorm_room", v)} />
            <EField label="床号" v={p.bed_no ?? ""} onChange={(v) => setField("bed_no", v)} />
            <EField label="紧急联系人" v={p.emergency_contact ?? ""} onChange={(v) => setField("emergency_contact", v)} />
            <EField label="紧急联系人电话" v={p.emergency_phone ?? ""} onChange={(v) => setField("emergency_phone", v)} />
            <div className="sm:col-span-2">
              <Label>家庭住址</Label>
              <Input value={p.address ?? ""} onChange={(e) => setField("address", e.target.value)} />
            </div>
            <div>
              <Label>学校</Label>
              <Input value={p.school ?? ""} disabled />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={saveProfile} disabled={saving}>
                {saving ? "保存中…" : "保存修改"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">修改密码</CardTitle>
            <CardDescription>设置新的登录密码，至少 6 位</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>新密码</Label>
              <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <Label>确认新密码</Label>
              <Input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={changePassword} disabled={pwdSaving}>
                {pwdSaving ? "提交中…" : "提交"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

const Field = ({
  label, v,
}: { label: string; v: string | null }) => (
  <div>
    <Label>{label}</Label>
    <Input value={v ?? ""} disabled />
  </div>
);

const EField = ({
  label, v, onChange, placeholder,
}: { label: string; v: string; onChange: (v: string) => void; placeholder?: string }) => (
  <div>
    <Label>{label}</Label>
    <Input value={v} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

export default MyProfile;