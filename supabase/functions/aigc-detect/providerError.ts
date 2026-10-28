export function providerErrorMessage(raw: { Code?: unknown; Msg?: unknown }): string {
  const message = String(raw.Msg ?? "");
  if (/download.*(?:error|fail)|imageUrl/i.test(message)) return "阿里云无法读取佐证图片，本次未获得鉴别结果。";
  if (/access.?key|signature|unauthorized|forbidden/i.test(message)) return "鉴别服务授权失败，请管理员检查阿里云权限配置。";
  if (/quota|balance|arrears/i.test(message)) return "鉴别服务额度不足，请管理员检查阿里云账户。";
  return "阿里云鉴别服务未能完成检测，请稍后重试。";
}