import { describe, expect, it } from "vitest";
import { creditFinalizationPolicy } from "../../supabase/functions/evaluate-application/credit-reference";

describe("填表学分最终以教师认定为准", () => {
  it("填表申请不得自动落实自报学分", () => {
    expect(creditFinalizationPolicy(1, 10)).toEqual({ requiresTeacher: true, suggestedCredit: null });
  });
  it("多条申请不得用单个历史案例给整表定分", () => {
    expect(creditFinalizationPolicy(3, 8)).toEqual({ requiresTeacher: true, suggestedCredit: null });
  });
  it("旧版非填表申请仍沿用原案例参考分", () => {
    expect(creditFinalizationPolicy(0, 6)).toEqual({ requiresTeacher: false, suggestedCredit: 6 });
  });
});