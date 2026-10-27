import { supabase } from "@/integrations/supabase/client";
import { explainError } from "@/lib/errors";

/** 彻底删除一条申请（仅超管/本学院管理员），并清理其上传文件。 */
export async function deleteApplication(appId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("delete_application" as never, { _app_id: appId } as never);
  if (error) {
    const { description } = await explainError(error, "删除失败");
    return { ok: false, error: description || "删除失败，请刷新页面后再试" };
  }
  const paths = ((data as unknown as string[] | null) ?? []).filter(Boolean);
  if (paths.length) {
    // 文件清理失败不影响结果；孤立文件后续会被自动清理
    await supabase.storage.from("application-files").remove(paths).catch(() => undefined);
  }
  return { ok: true };
}
