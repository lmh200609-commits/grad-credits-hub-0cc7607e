import { supabase } from "@/integrations/supabase/client";
import { explainError } from "@/lib/errors";

export type Decision = "approved" | "rejected";
export type DecideResult = { ok: number; fail: number; errors: string[] };

const REVIEWABLE = new Set([
  "pending_ai",
  "pending_review",
  "auto_approved",
  "rejected_by_ai",
  "approved",
  "rejected",
]);

export async function decideOne(opts: {
  appId: string;
  decision: Decision;
  credit: number | null;
  note: string | null;
  reviewerId: string;
  isAdmin: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { appId, decision, credit, note, reviewerId, isAdmin } = opts;
  const action = isAdmin ? "admin_review" : "teacher_review";

  const { error: re } = await supabase.from("application_reviews").insert({
    application_id: appId,
    reviewer_id: reviewerId,
    action: action as "admin_review" | "teacher_review",
    decision: decision as "approved" | "rejected",
    credit: decision === "approved" ? credit : null,
    note: note?.trim() || null,
  });
  if (re) return { ok: false, error: (await explainError(re)).description };

  const { error: ue } = await supabase
    .from("applications")
    .update({
      status: decision,
      final_credit: decision === "approved" ? credit : null,
      final_reviewer_id: reviewerId,
      final_review_note: note?.trim() || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", appId);
  if (ue) return { ok: false, error: (await explainError(ue)).description };
  return { ok: true };
}

export async function decideBatch(opts: {
  rows: { id: string; status: string; ai_suggested_credit: number | null; final_credit: number | null }[];
  decision: Decision;
  defaultCredit: number;
  note: string | null;
  reviewerId: string;
  isAdmin: boolean;
  onProgress?: (done: number, total: number) => void;
}): Promise<DecideResult> {
  const { rows, decision, defaultCredit, note, reviewerId, isAdmin, onProgress } = opts;
  const result: DecideResult = { ok: 0, fail: 0, errors: [] };
  const eligible = rows.filter((r) => REVIEWABLE.has(r.status));
  for (let i = 0; i < eligible.length; i++) {
    const r = eligible[i];
    const credit = decision === "approved"
      ? (r.final_credit ?? r.ai_suggested_credit ?? defaultCredit)
      : null;
    const res = await decideOne({ appId: r.id, decision, credit, note, reviewerId, isAdmin });
    if (res.ok) result.ok++;
    else { result.fail++; if (res.error) result.errors.push(res.error); }
    onProgress?.(i + 1, eligible.length);
  }
  result.fail += rows.length - eligible.length;
  if (rows.length > eligible.length) {
    result.errors.unshift(`${rows.length - eligible.length} 条状态不可改，已跳过`);
  }
  return result;
}
