import { z } from "zod";

// 账号 = 字母+数字（学号/工号/手机号/管理员账号 A########），前端拼接 @admin.local 交给 Supabase
export const loginSchema = z.object({
  account: z
    .string()
    .trim()
    .min(3, "账号至少 3 位")
    .max(20, "账号不超过 20 位")
    .regex(/^[A-Za-z0-9]+$/, "账号只能包含字母和数字"),
  password: z.string().min(6, "密码至少 6 位").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const applySchema = z.object({
  description: z
    .string()
    .trim()
    .max(2000, "说明不超过 2000 字")
    .optional()
    .or(z.literal("")),
  selected_keywords: z.array(z.string()).default([]),
  custom_keywords: z.array(z.string()).default([]),
  rule_id: z.string().optional().nullable(),
});
export type ApplyInput = z.infer<typeof applySchema>;

// 新版填表流程：申请表解析出的条目 + 佐证图片
export const formApplySchema = z.object({
  itemCount: z.number().int().min(1, "申请表中未解析到有效条目"),
  attachmentCount: z.number().int().min(1, "请至少上传 1 张佐证材料图片").max(20, "佐证图片最多 20 张"),
});

export const ruleSchema = z.object({
  name: z.string().trim().min(1, "请填写规则名称").max(100),
  category: z.string().trim().max(50).optional().or(z.literal("")),
  keywords: z.string().max(500).optional().or(z.literal("")),
  credit: z.coerce.number().min(0, "学分需 ≥ 0").max(20, "学分不超过 20"),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  active: z.boolean().default(true),
});
export type RuleInput = z.infer<typeof ruleSchema>;

export const caseSchema = z.object({
  title: z.string().trim().min(1, "标题必填").max(200),
  summary: z.string().trim().min(1, "摘要必填").max(2000),
  rule_id: z.string().default("none"),
  awarded_credit: z.coerce.number().min(0).max(20),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type CaseInput = z.infer<typeof caseSchema>;

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "密码至少 8 位")
    .max(128)
    .regex(/[A-Za-z]/, "需包含字母")
    .regex(/[0-9]/, "需包含数字"),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
