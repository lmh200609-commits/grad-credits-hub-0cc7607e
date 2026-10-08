import { describe, it, expect } from "vitest";
import { missingProfileFields, isProfileComplete } from "./profileCompleteness";

const full = { full_name: "白雪", class_name: "软工2401", major: "软件工程", id_card: "x", gender: "女" };

describe("profile completeness", () => {
  it("five fields filled is complete", () => {
    expect(isProfileComplete(full)).toBe(true);
  });
  it("missing id card is incomplete", () => {
    expect(missingProfileFields({ ...full, id_card: "" })).toEqual(["身份证号"]);
  });
  it("whitespace counts as missing", () => {
    expect(missingProfileFields({ ...full, gender: "  ", major: null })).toEqual(["专业", "性别"]);
  });
  it("id card is not format-validated", () => {
    expect(isProfileComplete({ ...full, id_card: "123" })).toBe(true);
  });
});
