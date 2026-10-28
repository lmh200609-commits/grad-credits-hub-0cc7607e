import { describe, it, expect } from "vitest";
import { gradeOf } from "./creditStandard";

describe("认定成绩等级按合计学分自动判定", () => {
  it("3 分不及格", () => expect(gradeOf(3).label).toBe("不及格"));
  it("4 分及格", () => expect(gradeOf(4).label).toBe("及格"));
  it("5 分中等", () => expect(gradeOf(5).label).toBe("中等"));
  it("6 分良好", () => expect(gradeOf(6).label).toBe("良好"));
  it("7 分优秀", () => expect(gradeOf(7).label).toBe("优秀"));
  it("20 分优秀", () => expect(gradeOf(20).label).toBe("优秀"));
});
