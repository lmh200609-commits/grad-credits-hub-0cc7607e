import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseApplicationForm } from "./parseForm";

function template(name: string) {
  return XLSX.read(readFileSync(`public/templates/${name}`), { type: "buffer" });
}
const parse = (workbook: XLSX.WorkBook) => parseApplicationForm(XLSX.write(workbook, { type: "array", bookType: "xlsx" }));

describe("实际下载表格的成果解析", () => {
  it("空白申请表不能生成成果", async () => {
    expect((await parse(template("application-template.xlsx"))).ok).toBe(false);
  });
  it("示例表连续样例行不能生成正式成果", async () => {
    expect((await parse(template("application-sample.xlsx"))).ok).toBe(false);
  });
  it("退役模板表头与星号编号均不能生成成果", async () => {
    expect((await parse(template("veteran-application-template.xlsx"))).ok).toBe(false);
  });
  it("已填写退役证书应保留编号与自报4分，不解析表头", async () => {
    const wb = template("veteran-application-template.xlsx");
    const ws = wb.Sheets[wb.SheetNames[0]];
    ws.A6 = { t: "s", v: "军退字第20260001号" };
    ws.C6 = { t: "s", v: "2022年9月" };
    ws.D6 = { t: "s", v: "2024年9月" };
    const result = await parse(wb);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ project: "退役证书", achievement: "军退字第20260001号", credit: 4 });
  });
  it("普通成果连续行继承认定项目，分别计入6分和4分", async () => {
    const wb = template("application-template.xlsx");
    const ws = wb.Sheets[wb.SheetNames[0]];
    XLSX.utils.sheet_add_aoa(ws, [[1, "发表论文", "数字贸易研究", "省级普刊", "第一作者", 6], [2, "", "电子商务研究", "省级普刊", "其他作者", 4]], { origin: "A6" });
    const result = await parse(wb);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.items.map(item => [item.project, item.credit])).toEqual([["发表论文", 6], ["发表论文", 4]]);
  });
});