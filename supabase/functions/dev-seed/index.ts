// Dev-only seed:
//  - Default mode: creates 5 fixed test accounts (idempotent). Password: Test1234.
//  - Perf mode (POST { mode: "perf", students?: 2000, applications?: 5000, cases?: 500 }):
//      bulk-create perf-test data marked with department='__perftest__' / cases.notes='__perftest__'.
//  - Cleanup mode (POST { mode: "cleanup_perf" }): removes all perf-test data and auth users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Seed = {
  student_no: string;
  full_name: string;
  role: "admin" | "teacher" | "student";
  department?: string;
  major?: string;
  class_name?: string;
};

const SEEDS: Seed[] = [
  { student_no: "2024001", full_name: "白雪", role: "student", department: "计算机学院", major: "软件工程", class_name: "软工2401" },
  { student_no: "2024002", full_name: "李明", role: "student", department: "计算机学院", major: "计算机科学", class_name: "计科2401" },
  { student_no: "2024003", full_name: "王芳", role: "student", department: "外国语学院", major: "英语", class_name: "英语2401" },
  { student_no: "T001", full_name: "张老师", role: "teacher", department: "计算机学院" },
  { student_no: "A001", full_name: "测试管理员", role: "admin" },
  // 额外 10 个测试学生账号（一键登录用）
  { student_no: "S2024101", full_name: "赵子轩", role: "student", department: "计算机学院", major: "软件工程", class_name: "软工2401" },
  { student_no: "S2024102", full_name: "钱思雨", role: "student", department: "计算机学院", major: "计算机科学", class_name: "计科2401" },
  { student_no: "S2024103", full_name: "孙浩然", role: "student", department: "外国语学院", major: "英语", class_name: "英语2401" },
  { student_no: "S2024104", full_name: "周梦琪", role: "student", department: "经济管理学院", major: "金融学", class_name: "金融2401" },
  { student_no: "S2024105", full_name: "吴佳怡", role: "student", department: "经济管理学院", major: "市场营销", class_name: "营销2401" },
  { student_no: "S2024106", full_name: "郑俊杰", role: "student", department: "机械工程学院", major: "机械设计", class_name: "机设2401" },
  { student_no: "S2024107", full_name: "王雨欣", role: "student", department: "法学院", major: "法学", class_name: "法学2401" },
  { student_no: "S2024108", full_name: "冯志强", role: "student", department: "电子信息学院", major: "电子信息工程", class_name: "电信2401" },
  { student_no: "S2024109", full_name: "陈语桐", role: "student", department: "艺术学院", major: "视觉传达", class_name: "视传2401" },
  { student_no: "S2024110", full_name: "褚思源", role: "student", department: "计算机学院", major: "人工智能", class_name: "AI2401" },
];

const PASSWORD = "Test1234";
const PERF_PASSWORD = "PerfTest1234";
const PERF_MARK = "__perftest__";
const CONCURRENCY = 20;

const STATUSES = ["pending_ai", "auto_approved", "pending_review", "rejected_by_ai", "approved", "rejected"] as const;
const MAJORS = ["软件工程", "计算机科学", "英语", "电子商务", "机械设计", "金融学", "市场营销", "法学"];
const CLASSES = ["软工2401", "软工2402", "计科2401", "英语2401", "商务2401", "机设2401", "金融2401", "法学2401"];
const COMP_NAMES = ["全国大学生英语竞赛", "蓝桥杯", "数学建模", "创新创业大赛", "机器人大赛", "电子商务三创赛"];
const ACHIEVES = ["英语竞赛", "蓝桥杯", "数模", "创新创业", "机器人", "三创赛"];
const LEVELS = ["国家级一等奖", "国家级二等奖", "省级一等奖", "省级二等奖", "校级一等奖", "校级二等奖"];
const IDENTS = ["第一作者", "第一参与人", "主持人", "参与人"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Parse body first (may carry a seed secret as alternative auth)
    let mode = "default";
    let perfStudents = 2000, perfApps = 5000, perfCases = 500;
    let bodySecret: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.mode) mode = body.mode;
        if (typeof body?.students === "number") perfStudents = body.students;
        if (typeof body?.applications === "number") perfApps = body.applications;
        if (typeof body?.cases === "number") perfCases = body.cases;
        if (typeof body?.secret === "string") bodySecret = body.secret;
      } catch { /* no body */ }
    }

    // Auth: either a valid TEST_SEED_SECRET, or a super_admin JWT
    const seedSecret = Deno.env.get("TEST_SEED_SECRET");
    const secretOk = !!seedSecret && bodySecret === seedSecret && mode === "default";
    if (!secretOk) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: claimErr } = await userClient.auth.getClaims(authHeader.slice(7));
      if (claimErr || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const callerId = claims.claims.sub as string;
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "super_admin");
      if (!roles || roles.length === 0) {
        return new Response(JSON.stringify({ error: "Forbidden: super_admin only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (mode === "perf") {
      return await runPerfSeed(admin, perfStudents, perfApps, perfCases);
    }
    if (mode === "cleanup_perf") {
      return await runCleanup(admin);
    }

    const results: { email: string; status: string }[] = [];

    for (const s of SEEDS) {
      const email = `${s.student_no}@admin.local`;

      // Check if profile already exists
      const { data: existing } = await admin
        .from("profiles")
        .select("user_id")
        .eq("student_no", s.student_no)
        .maybeSingle();

      let userId: string;
      if (existing?.user_id) {
        userId = existing.user_id;
        // Reset password so it always matches
        await admin.auth.admin.updateUserById(userId, { password: PASSWORD });
        results.push({ email, status: "exists, password reset" });
      } else {
        const { data: u, error: ce } = await admin.auth.admin.createUser({
          email,
          password: PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: s.full_name, student_no: s.student_no },
        });
        if (ce) {
          results.push({ email, status: `create failed: ${ce.message}` });
          continue;
        }
        userId = u.user!.id;
        results.push({ email, status: "created" });
      }

      // Upsert profile
      await admin.from("profiles").update({
        full_name: s.full_name,
        student_no: s.student_no,
        department: s.department ?? null,
        major: s.major ?? null,
        class_name: s.class_name ?? null,
        email,
      }).eq("user_id", userId);

      // Ensure role
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("id")
        .eq("user_id", userId)
        .eq("role", s.role)
        .maybeSingle();
      if (!roleRow) {
        await admin.from("user_roles").insert({ user_id: userId, role: s.role });
      }
    }

    return new Response(JSON.stringify({ success: true, password: PASSWORD, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runPerfSeed(admin: any, nStudents: number, nApps: number, nCases: number) {
  const t0 = Date.now();
  // 1) Create N auth users in parallel batches
  const userIds: string[] = [];
  const failures: string[] = [];

  // Find existing perf students to skip recreation (idempotent-ish)
  const { data: existing } = await admin
    .from("profiles").select("user_id, student_no")
    .eq("department", PERF_MARK).limit(nStudents);
  const existingNos = new Set<string>((existing ?? []).map((p: { student_no: string }) => p.student_no));
  (existing ?? []).forEach((p: { user_id: string }) => userIds.push(p.user_id));

  const toCreate: number[] = [];
  for (let i = 1; i <= nStudents; i++) {
    const no = "PT" + String(i).padStart(5, "0");
    if (!existingNos.has(no)) toCreate.push(i);
  }

  for (let i = 0; i < toCreate.length; i += CONCURRENCY) {
    const batch = toCreate.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((idx) => createPerfStudent(admin, idx)),
    );
    settled.forEach((r, j) => {
      if (r.status === "fulfilled") userIds.push(r.value);
      else failures.push(`student #${batch[j]}: ${String(r.reason).slice(0, 80)}`);
    });
  }

  // 2) Bulk insert applications (chunked)
  if (userIds.length === 0) {
    return json({ error: "no perf students available", failures }, 500);
  }
  const appRows: Record<string, unknown>[] = [];
  for (let i = 1; i <= nApps; i++) {
    const stuId = userIds[(i - 1) % userIds.length];
    const st = STATUSES[i % STATUSES.length];
    const isApproved = st === "auto_approved" || st === "approved";
    const hasAi = st === "auto_approved" || st === "rejected_by_ai";
    appRows.push({
      student_id: stuId,
      description: `性能测试申请 #${i}：参加${COMP_NAMES[i % COMP_NAMES.length]}获奖`,
      selected_keywords: ["学科竞赛", LEVELS[i % LEVELS.length], IDENTS[i % IDENTS.length]],
      custom_keywords: [],
      status: st,
      ai_suggested_credit: isApproved ? 1.5 : null,
      ai_confidence: hasAi ? 0.9 : null,
      final_credit: isApproved ? 1.5 : null,
      submitted_at: new Date(Date.now() - i * 60_000).toISOString(),
    });
  }
  const APP_CHUNK = 500;
  let appsInserted = 0;
  for (let i = 0; i < appRows.length; i += APP_CHUNK) {
    const slice = appRows.slice(i, i + APP_CHUNK);
    const { error } = await admin.from("applications").insert(slice);
    if (error) { failures.push(`apps batch ${i}: ${error.message}`); }
    else appsInserted += slice.length;
  }

  // 3) Bulk insert cases
  const caseRows: Record<string, unknown>[] = [];
  for (let i = 1; i <= nCases; i++) {
    caseRows.push({
      title: `测试案例 #${String(i).padStart(3, "0")}：${COMP_NAMES[i % COMP_NAMES.length]}`,
      summary: `项目=学科竞赛；成果=${ACHIEVES[i % ACHIEVES.length]}；级别=${LEVELS[i % LEVELS.length]}；身份=${IDENTS[i % IDENTS.length]}`,
      awarded_credit: [0.5, 1.0, 1.5, 2.0, 3.0][i % 5],
      notes: PERF_MARK,
    });
  }
  let casesInserted = 0;
  for (let i = 0; i < caseRows.length; i += APP_CHUNK) {
    const slice = caseRows.slice(i, i + APP_CHUNK);
    const { error } = await admin.from("cases").insert(slice);
    if (error) { failures.push(`cases batch ${i}: ${error.message}`); }
    else casesInserted += slice.length;
  }

  return json({
    success: true,
    elapsed_sec: ((Date.now() - t0) / 1000).toFixed(1),
    students_total: userIds.length,
    students_created_now: toCreate.length - failures.filter((f) => f.startsWith("student")).length,
    applications_inserted: appsInserted,
    cases_inserted: casesInserted,
    failures: failures.slice(0, 10),
    failure_count: failures.length,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPerfStudent(admin: any, idx: number): Promise<string> {
  const no = "PT" + String(idx).padStart(5, "0");
  const email = `${no.toLowerCase()}@perftest.local`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email,
    password: PERF_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: `测试学生${String(idx).padStart(4, "0")}`, student_no: no },
  });
  if (error || !u?.user) throw new Error(error?.message ?? "create failed");
  const userId = u.user.id;
  await admin.from("profiles").update({
    full_name: `测试学生${String(idx).padStart(4, "0")}`,
    student_no: no,
    department: PERF_MARK,
    major: MAJORS[idx % MAJORS.length],
    class_name: CLASSES[idx % CLASSES.length],
    email,
  }).eq("user_id", userId);
  await admin.from("user_roles").insert({ user_id: userId, role: "student" });
  return userId;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCleanup(admin: any) {
  const t0 = Date.now();
  const { data: profs } = await admin
    .from("profiles").select("user_id").eq("department", PERF_MARK).limit(10000);
  const ids: string[] = (profs ?? []).map((p: { user_id: string }) => p.user_id);

  // Delete applications first
  if (ids.length) {
    await admin.from("applications").delete().in("student_id", ids);
  }
  // Delete cases
  await admin.from("cases").delete().eq("notes", PERF_MARK);
  // Delete auth users (cascades roles + profile via fk)
  let deleted = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((id) => admin.auth.admin.deleteUser(id)),
    );
    settled.forEach((r) => { if (r.status === "fulfilled") deleted++; });
  }
  return json({
    success: true,
    elapsed_sec: ((Date.now() - t0) / 1000).toFixed(1),
    auth_users_deleted: deleted,
    perf_profiles_targeted: ids.length,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
