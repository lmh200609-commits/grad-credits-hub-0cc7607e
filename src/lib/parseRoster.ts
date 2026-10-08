import * as XLSX from "xlsx";

export type ParsedRow = {
  student_no: string;
  full_name: string;
  phone?: string;
  class_name?: string;
  department?: string;
  major?: string;
  role: "admin" | "teacher" | "student";
  password: string;
  gender?: string;
  id_card?: string;
  ethnicity?: string;
  political_status?: string;
  birth_date?: string;
  enrollment_year?: number;
  advisor?: string;
  apartment_no?: string;
  dorm_room?: string;
  bed_no?: string;
  college_name?: string;
};

export const TEMPLATE_COLUMNS: { header: string; field: string; required?: boolean; note: string }[] = [
  { header: "学号/工号", field: "student_no", required: true, note: "唯一，仅字母/数字/._-" },
  { header: "姓名", field: "full_name", required: true, note: "1-30 字符" },
  { header: "角色", field: "role", required: true, note: "学生 / 教师 / 管理员" },
  { header: "性别", field: "gender", note: "男 / 女" },
  { header: "身份证号", field: "id_card", note: "可选；不填则学生首次登录时自行填写" },
  { header: "民族", field: "ethnicity", note: "例：汉族" },
  { header: "政治面貌", field: "political_status", note: "例：群众 / 共青团员 / 中共党员" },
  { header: "出生日期", field: "birth_date", note: "YYYY-MM-DD（Excel 日期格式自动转换）" },
  { header: "手机号", field: "phone", note: "7-15 位数字（用于生成默认密码）" },
  { header: "学院", field: "college_name", note: "须与系统中的学院名称完全一致；超级管理员导入教师/管理员时必填" },
  { header: "院系", field: "department", note: "文本" },
  { header: "专业", field: "major", note: "文本（学生用）" },
  { header: "班级", field: "class_name", note: "文本（学生用）" },
  { header: "年级", field: "enrollment_year", note: "4 位年份，如 2024" },
  { header: "辅导员", field: "advisor", note: "文本" },
  { header: "公寓号", field: "apartment_no", note: "≤20 字符" },
  { header: "宿舍号", field: "dorm_room", note: "≤20 字符" },
  { header: "床号", field: "bed_no", note: "中文/字母/数字/横线，≤12 位" },
];

const ROLE_MAP: Record<string, ParsedRow["role"]> = {
  "学生": "student", "student": "student",
  "教师": "teacher", "老师": "teacher", "teacher": "teacher",
  "管理员": "admin", "admin": "admin",
};

const norm = (s: unknown) =>
  String(s ?? "").trim().replace(/[：]/g, ":").replace(/\s+/g, "");

const excelSerialToDate = (n: number): string | null => {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
};

const toDateString = (v: unknown): string | undefined => {
  if (v == null || v === "") return undefined;
  if (v instanceof Date) {
    const y = v.getUTCFullYear();
    const mo = String(v.getUTCMonth() + 1).padStart(2, "0");
    const da = String(v.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }
  if (typeof v === "number") return excelSerialToDate(v) ?? String(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return s;
};

export const buildPassword = (studentNo: string, phone?: string): string => {
  const digits = (phone ?? "").replace(/\D+/g, "");
  const tail = digits.length >= 6 ? digits.slice(-6) : digits.padStart(6, "0");
  return `${studentNo}${tail}`;
};

export type ParseResult =
  | { ok: true; rows: ParsedRow[] }
  | { ok: false; error: string; missingHeaders?: string[] };

export const parseRosterWorkbook = async (
  file: File,
  defaultRole: ParsedRow["role"],
): Promise<ParseResult> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { ok: false, error: "未找到任何工作表" };

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    rawNumbers: false,
  });
  if (rows.length === 0) return { ok: false, error: "表格无数据行" };

  const presentHeaders = new Set(Object.keys(rows[0]).map((k) => norm(k)));
  // Accept 工号 / 学号 as aliases for the required 学号/工号 column.
  const hasStudentNo =
    presentHeaders.has(norm("学号/工号")) ||
    presentHeaders.has(norm("工号")) ||
    presentHeaders.has(norm("学号"));
  const missing: string[] = [];
  if (!hasStudentNo) missing.push("学号/工号");
  if (!presentHeaders.has(norm("姓名"))) missing.push("姓名");
  if (!presentHeaders.has(norm("角色"))) missing.push("角色");
  if (missing.length > 0) {
    return {
      ok: false,
      error: `缺少必填列：${missing.join("、")}。请下载并使用最新「账号导入模板」`,
      missingHeaders: missing,
    };
  }

  const keyByHeader: Record<string, string> = {};
  for (const k of Object.keys(rows[0])) keyByHeader[norm(k)] = k;

  const get = (row: Record<string, unknown>, header: string): unknown => {
    const k = keyByHeader[norm(header)];
    return k ? row[k] : undefined;
  };

  const pickFirst = (...vals: unknown[]): string => {
    for (const v of vals) {
      const s = String(v ?? "").trim();
      if (s.length > 0) return s;
    }
    return "";
  };

  const parsed: ParsedRow[] = rows.map((row) => {
    const studentNo = pickFirst(
      get(row, "学号/工号"),
      get(row, "工号"),
      get(row, "学号"),
    );
    const fullName = String(get(row, "姓名") ?? "").trim();
    const roleRaw = String(get(row, "角色") ?? "").trim();
    const role = ROLE_MAP[roleRaw] ?? defaultRole;
    const phone = String(get(row, "手机号") ?? "").trim() || undefined;
    const yearRaw = String(get(row, "年级") ?? "").trim();
    const year = yearRaw ? Number(yearRaw) : undefined;

    return {
      student_no: studentNo,
      full_name: fullName,
      role,
      gender: String(get(row, "性别") ?? "").trim() || undefined,
      id_card: String(get(row, "身份证号") ?? "").trim() || undefined,
      ethnicity: String(get(row, "民族") ?? "").trim() || undefined,
      political_status: String(get(row, "政治面貌") ?? "").trim() || undefined,
      birth_date: toDateString(get(row, "出生日期")),
      phone,
      department: String(get(row, "院系") ?? "").trim() || undefined,
      major: String(get(row, "专业") ?? "").trim() || undefined,
      class_name: String(get(row, "班级") ?? "").trim() || undefined,
      enrollment_year: Number.isFinite(year as number) ? (year as number) : undefined,
      advisor: String(get(row, "辅导员") ?? "").trim() || undefined,
      apartment_no: String(get(row, "公寓号") ?? "").trim() || undefined,
      dorm_room: String(get(row, "宿舍号") ?? "").trim() || undefined,
      bed_no: String(get(row, "床号") ?? "").trim() || undefined,
      college_name:
        String(get(row, "学院") ?? "").trim() ||
        String(get(row, "学院名称") ?? "").trim() ||
        String(get(row, "college") ?? "").trim() ||
        undefined,
      password: buildPassword(studentNo, phone),
    };
  });

  return { ok: true, rows: parsed };
};

export const downloadRosterTemplate = () => {
  const headers = TEMPLATE_COLUMNS.map((c) => c.header);
  const sample = [
    "20240001", "张三", "学生", "男", "汉族", "共青团员",
    "2005-09-01", "13800138000", "信息工程学院",
    "信息工程学院", "软件工程", "软工2401", 2024,
    "李老师", "1号公寓", "201", "A1",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(10, h.length * 2 + 2) }));

  const noteRows = [
    ["列名", "是否必填", "说明 / 格式"],
    ...TEMPLATE_COLUMNS.map((c) => [c.header, c.required ? "必填" : "可选", c.note]),
    [],
    ["密码规则", "", "系统自动生成 = 学号 + 手机号后 6 位（不足左补 0；无手机号则补 6 个 0）。无需在表中填写。"],
    ["角色列", "", "可填「学生 / 教师 / 管理员」；为空则使用界面所选默认角色。"],
    ["学院列", "", "超级管理员导入教师/管理员账号必填，须与系统中的学院名称完全一致；普通学院管理员可不填，自动归属本学院。"],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(noteRows);
  ws2["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "账号名册");
  XLSX.utils.book_append_sheet(wb, ws2, "字段说明");
  XLSX.writeFile(wb, "账号导入模板.xlsx");
};

export const TEACHER_TEMPLATE_COLUMNS: { header: string; required?: boolean; note: string }[] = [
  { header: "工号", required: true, note: "唯一，仅字母/数字/._-" },
  { header: "姓名", required: true, note: "1-30 字符" },
  { header: "角色", required: true, note: "固定填「教师」（或「管理员」）" },
  { header: "学院", required: true, note: "必须与系统中的学院名称完全一致" },
  { header: "性别", note: "男 / 女" },
  { header: "民族", note: "例：汉族" },
  { header: "政治面貌", note: "例：群众 / 共青团员 / 中共党员" },
  { header: "出生日期", note: "YYYY-MM-DD" },
  { header: "手机号", note: "7-15 位数字（用于生成默认密码）" },
  { header: "院系", note: "可选，文本" },
];

export const downloadTeacherTemplate = () => {
  const headers = TEACHER_TEMPLATE_COLUMNS.map((c) => c.header);
  const sample = [
    "T2024001", "李老师", "教师", "信息工程学院",
    "女", "汉族", "中共党员",
    "1985-03-15", "13900139000", "软件工程系",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(10, h.length * 2 + 2) }));

  const noteRows = [
    ["列名", "是否必填", "说明 / 格式"],
    ...TEACHER_TEMPLATE_COLUMNS.map((c) => [c.header, c.required ? "必填" : "可选", c.note]),
    [],
    ["密码规则", "", "系统自动生成 = 工号 + 手机号后 6 位（不足左补 0；无手机号则补 6 个 0）。无需在表中填写。"],
    ["学院列", "", "超级管理员批量导入教师账号必填；普通学院管理员可留空，自动归属本学院。"],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(noteRows);
  ws2["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "教师名册");
  XLSX.utils.book_append_sheet(wb, ws2, "字段说明");
  XLSX.writeFile(wb, "教师导入模板.xlsx");
};
