import { afterEach, expect, it, vi } from "vitest";
import { withRequestTimeout } from "./requestTimeout";

afterEach(() => vi.useRealTimers());
it("未返回的鉴别请求在55秒结束等待并取消请求", async () => {
  vi.useFakeTimers();
  const abort = vi.fn();
  const result = withRequestTimeout(new Promise(() => {}), 55000, "等待超时", abort);
  const assertion = expect(result).rejects.toThrow("等待超时");
  await vi.advanceTimersByTimeAsync(55000);
  await assertion;
  expect(abort).toHaveBeenCalledTimes(1);
});
it("读取结果等待最多10秒", async () => {
  vi.useFakeTimers();
  const result = withRequestTimeout(new Promise(() => {}), 10000, "读取超时");
  const assertion = expect(result).rejects.toThrow("读取超时");
  await vi.advanceTimersByTimeAsync(10000);
  await assertion;
});
it("返回结果后清除超时定时器", async () => {
  vi.useFakeTimers();
  expect(await withRequestTimeout(Promise.resolve("real"), 55000, "等待超时")).toBe("real");
  expect(vi.getTimerCount()).toBe(0);
});