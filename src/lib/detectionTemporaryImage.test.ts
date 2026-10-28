import { expect, it } from "vitest";
import { ossCanonicalRequest } from "../../supabase/functions/aigc-detect/temporaryImage";

it("OSS临时图片上传签名包含安全令牌和完整对象路径", () => {
  expect(ossCanonicalRequest("PUT", "test-date", "test-token", "test-bucket", "prefix/image.jpg")).toBe("PUT\n\nimage/jpeg\ntest-date\nx-oss-security-token:test-token\n/test-bucket/prefix/image.jpg");
});
it("删除临时图片签名使用空内容类型", () => {
  expect(ossCanonicalRequest("DELETE", "test-date", "test-token", "test-bucket", "prefix/image.jpg")).toBe("DELETE\n\n\ntest-date\nx-oss-security-token:test-token\n/test-bucket/prefix/image.jpg");
});