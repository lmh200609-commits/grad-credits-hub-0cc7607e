export type RequiredProfile = {
  full_name?: string | null;
  class_name?: string | null;
  major?: string | null;
  id_card?: string | null;
  gender?: string | null;
};

export const REQUIRED_PROFILE_FIELDS: { key: keyof RequiredProfile; label: string }[] = [
  { key: "full_name", label: "姓名" },
  { key: "class_name", label: "班级" },
  { key: "major", label: "专业" },
  { key: "id_card", label: "身份证号" },
  { key: "gender", label: "性别" },
];

/** 返回缺失的必填项中文名；为空数组表示资料已完善 */
export function missingProfileFields(p: RequiredProfile | null | undefined): string[] {
  return REQUIRED_PROFILE_FIELDS.filter(({ key }) => !String(p?.[key] ?? "").trim()).map((f) => f.label);
}

export const isProfileComplete = (p: RequiredProfile | null | undefined) =>
  missingProfileFields(p).length === 0;
