// 仅限云端测试环境：确保一组测试账号存在（测试学院 + 开放批次），供登录页一键登录使用。
// 学校自托管服务器上不会生效（SUPABASE_URL 不匹配时直接拒绝）。
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PASSWORD = "Test12345";
const ACCOUNTS = [
  { account: "test_student", name: "测试学生", role: "student", student_no: "T2026001" },
  { account: "test_teacher", name: "测试老师", role: "teacher" },
  { account: "test_admin", name: "测试管理员", role: "admin" },
  { account: "test_super", name: "测试超管", role: "super_admin" },
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  if (!url.includes("eceqokilpppnwtfzgbvq")) return json({ error: "仅测试环境可用" }, 403);
  try {
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let { data: college } = await admin.from("colleges").select("id").eq("code", "TEST").maybeSingle();
    if (!college) {
      const { data, error } = await admin.from("colleges")
        .insert({ code: "TEST", name: "测试学院", short_name: "测试学院", system_title: "本科生创新实践学分认定系统", theme: {}, active: true })
        .select("id").single();
      if (error) throw error;
      college = data;
    }
    const cid = college!.id;

    const now = Date.now();
    const { data: win } = await admin.from("submission_windows").select("id")
      .eq("college_id", cid).eq("active", true)
      .lte("starts_at", new Date().toISOString()).gte("ends_at", new Date().toISOString()).limit(1);
    if (!win?.length) {
      await admin.from("submission_windows").insert({
        college_id: cid, name: "测试批次", active: true,
        starts_at: new Date(now - 86400000).toISOString(),
        ends_at: new Date(now + 365 * 86400000).toISOString(),
      });
    }

    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const a of ACCOUNTS) {
      const email = `${a.account}@admin.local`;
      let uid = list?.users?.find((u) => u.email === email)?.id;
      if (!uid) {
        const { data, error } = await admin.auth.admin.createUser({
          email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: a.name },
        });
        if (error) throw error;
        uid = data.user.id;
      } else {
        await admin.auth.admin.updateUserById(uid, { password: PASSWORD });
      }
      await admin.from("profiles").upsert({
        user_id: uid, email, full_name: a.name, college_id: cid,
        ...(a.role === "student"
          ? { student_no: a.student_no, class_name: "测试2601", major: "测试专业", id_card: "220000200001010000", gender: "男" }
          : {}),
      }, { onConflict: "user_id" });
      const { data: has } = await admin.from("user_roles").select("id").eq("user_id", uid).eq("role", a.role).maybeSingle();
      if (!has) {
        await admin.from("user_roles").insert({ user_id: uid, role: a.role, college_id: a.role === "super_admin" ? null : cid });
      }
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
