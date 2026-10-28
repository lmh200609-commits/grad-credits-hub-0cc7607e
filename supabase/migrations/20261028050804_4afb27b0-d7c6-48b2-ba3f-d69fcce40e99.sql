UPDATE public.applications
SET final_credit = claimed_credit
WHERE status IN ('approved','auto_approved')
  AND claimed_credit IS NOT NULL
  AND (final_credit IS NULL OR (final_credit = 1 AND claimed_credit <> 1));