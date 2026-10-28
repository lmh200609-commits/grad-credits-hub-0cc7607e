import { describe, expect, it } from "vitest";
import { canReviewDetection, shouldSkipDetection } from "../../supabase/functions/aigc-detect/retryPolicy";

describe("鉴别重试保护", () => {
  it("手动重试会重新检测失败记录", () => {
    expect(shouldSkipDetection("error", true)).toBe(false);
  });
  it("自动调用不会重复检测已处理记录", () => {
    expect(shouldSkipDetection("real", false)).toBe(true);
    expect(shouldSkipDetection("error", false)).toBe(true);
    expect(shouldSkipDetection("pending", false)).toBe(false);
  });
  it("本学院教师和管理员可以重新鉴别", () => {
    for (const role of ["teacher", "admin"]) {
      expect(canReviewDetection([{ role, college_id: "college-a" }], "college-a")).toBe(true);
      expect(canReviewDetection([{ role, college_id: "college-a" }], "college-b")).toBe(false);
    }
  });
  it("学生不能强制重试，超级管理员可以", () => {
    expect(canReviewDetection([{ role: "student", college_id: "college-a" }], "college-a")).toBe(false);
    expect(canReviewDetection([{ role: "super_admin", college_id: null }], "college-a")).toBe(true);
  });
});