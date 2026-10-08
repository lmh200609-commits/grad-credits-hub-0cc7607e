import { describe, it, expect } from "vitest";
import { validateNewPassword } from "./changePassword";

describe("validateNewPassword", () => {
  it("要求当前密码", () => expect(validateNewPassword("", "abc12345", "abc12345")).toBe("请输入当前密码"));
  it("至少 8 位", () => expect(validateNewPassword("old1", "abc1234", "abc1234")).toBe("新密码至少 8 位"));
  it("须含字母和数字", () => expect(validateNewPassword("old1", "12345678", "12345678")).toBe("新密码须同时包含字母和数字"));
  it("不能与旧密码相同", () => expect(validateNewPassword("abc12345", "abc12345", "abc12345")).toBe("新密码不能与当前密码相同"));
  it("两次一致", () => expect(validateNewPassword("old1", "abc12345", "abc12346")).toBe("两次输入的新密码不一致"));
  it("合法通过", () => expect(validateNewPassword("old1", "abc12345", "abc12345")).toBeNull());
});
