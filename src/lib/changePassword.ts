import { supabase } from "@/integrations/supabase/client";

/** 新密码规则：至少 8 位，同时包含字母和数字，不超过 72 位 */
export function validateNewPassword(current: string, next: string, confirm: string): string | null {
  if (!current) return "请输入当前密码";
  if (!next) return "请输入新密码";
  if (next.length < 8) return "新密码至少 8 位";
  if (next.length > 72) return "新密码不能超过 72 位";
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return "新密码须同时包含字母和数字";
  if (/\s/.test(next)) return "新密码不能包含空格";
  if (next === current) return "新密码不能与当前密码相同";
  if (next !== confirm) return "两次输入的新密码不一致";
  return null;
}

/** 先用当前密码复核身份，再修改密码。返回中文错误或 null */
export async function changeOwnPassword(current: string, next: string, confirm: string): Promise<string | null> {
  const invalid = validateNewPassword(current, next, confirm);
  if (invalid) return invalid;
  const { data: u } = await supabase.auth.getUser();
  const email = u.user?.email;
  if (!email) return "登录已失效，请重新登录";
  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: current });
  if (verifyErr) {
    if (/rate|too many/i.test(verifyErr.message)) return "尝试次数过多，请稍后再试";
    return "当前密码不正确";
  }
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    if (/same|different/i.test(error.message)) return "新密码不能与当前密码相同";
    if (/weak|short/i.test(error.message)) return "新密码强度不够，请换一个更复杂的密码";
    return "修改失败，请稍后重试";
  }
  return null;
}
