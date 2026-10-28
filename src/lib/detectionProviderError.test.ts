import { expect, it } from "vitest";
import { providerErrorMessage } from "../../supabase/functions/aigc-detect/providerError";

it("将阿里云HTTP200但业务404的读图错误转换为明确失败", () => {
  expect(providerErrorMessage({ Code: 404, Msg: "download error(imageUrl)" })).toBe("阿里云无法读取佐证图片，本次未获得鉴别结果。");
});
it("未知服务错误不会泄露原始返回", () => {
  expect(providerErrorMessage({ Code: 500, Msg: '{"internal":"trace"}' })).toBe("阿里云鉴别服务未能完成检测，请稍后重试。");
});