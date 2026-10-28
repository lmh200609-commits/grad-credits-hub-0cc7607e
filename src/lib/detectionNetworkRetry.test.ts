import { expect, it, vi } from "vitest";
import { retryConnection, detectionFailed } from "../../supabase/functions/aigc-detect/networkRetry";

it("连接超时后重连一次可以成功", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("Connection timed out")).mockResolvedValueOnce("result");
  expect(await retryConnection(request, () => true)).toBe("result");
  expect(request).toHaveBeenCalledTimes(2);
});
it("连续连接失败最多调用两次", async () => {
  const request = vi.fn().mockRejectedValue(new Error("fetch failed"));
  await expect(retryConnection(request, () => true)).rejects.toThrow("fetch failed");
  expect(request).toHaveBeenCalledTimes(2);
});
it("超过期限不重连", async () => {
  const request = vi.fn().mockRejectedValue(new Error("timeout"));
  await expect(retryConnection(request, () => false)).rejects.toThrow("timeout");
  expect(request).toHaveBeenCalledTimes(1);
});
it("检测业务失败即使HTTP成功也不能算完成", () => {
  expect(detectionFailed({ status: "error" })).toBe(true);
  expect(detectionFailed({ status: "real" })).toBe(false);
  expect(detectionFailed({ status: "error", reason: "already_processed" })).toBe(true);
});