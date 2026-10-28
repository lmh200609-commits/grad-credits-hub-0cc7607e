import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AigcDetectAlert from "./AigcDetectAlert";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), single: vi.fn(), toast: vi.fn(), failure: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
} }));
vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/errors", () => ({ toastErrorLegacy: mocks.failure }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const props = { applicationId: "14aa52be-0565-4b8b-9e65-cce909996171", status: "error" as const, score: null, detail: {}, checkedAt: "2026-10-26T12:53:14Z", visible: true };

describe("重新鉴别", () => {
  it("发送强制重试并读取已保存的新结果", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "real" }, error: null });
    mocks.single.mockResolvedValue({ data: { aigc_status: "real", aigc_score: 0.12, aigc_detail: { request_id: "new-request" }, aigc_checked_at: "2026-10-28T06:10:00Z" }, error: null });
    render(<AigcDetectAlert {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "重新鉴别" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("aigc-detect", { body: { application_id: props.applicationId, force: true } }));
    await screen.findByText("AI 生图鉴别：判定为真实拍摄");
    expect(screen.getByText("AI 生成概率 12.0%")).toBeInTheDocument();
    expect(screen.getByText("调用编号：new-request")).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledTimes(1);
  });
  it("旧结果被跳过时不报成功", async () => {
    mocks.invoke.mockResolvedValue({ data: { reason: "already_processed", status: "error" }, error: null });
    mocks.single.mockResolvedValue({ data: { aigc_status: "error", aigc_score: null, aigc_detail: {}, aigc_checked_at: props.checkedAt }, error: null });
    render(<AigcDetectAlert {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "重新鉴别" }));
    await waitFor(() => expect(mocks.failure).toHaveBeenCalledTimes(1));
    expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("服务失败时展开最新失败原因而不报成功", async () => {
    mocks.invoke.mockResolvedValue({ data: { status: "error", note: "读取图片失败" }, error: null });
    mocks.single.mockResolvedValue({ data: { aigc_status: "error", aigc_score: null, aigc_detail: { error: "读取图片失败", request_id: "failed-request" }, aigc_checked_at: "2026-10-28T06:10:00Z" }, error: null });
    render(<AigcDetectAlert {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "重新鉴别" }));
    await screen.findByText("调用编号：failed-request");
    await waitFor(() => expect(mocks.failure).toHaveBeenCalledTimes(1));
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});