CREATE OR REPLACE FUNCTION public.enqueue_aigc_detect_after_eval()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_done boolean;
BEGIN
  v_done := (NEW.ai_last_attempt_at IS NOT NULL AND OLD.ai_last_attempt_at IS DISTINCT FROM NEW.ai_last_attempt_at)
         OR (OLD.status = 'pending_ai' AND NEW.status <> 'pending_ai');
  IF v_done AND NEW.status <> 'rejected_by_ai' AND NEW.aigc_status = 'pending'
     AND ( (NEW.file_path IS NOT NULL AND NEW.file_path ~* '\.(png|jpe?g|webp|gif|bmp|pdf)$')
           OR EXISTS (SELECT 1 FROM public.application_attachments WHERE application_id = NEW.id) ) THEN
    INSERT INTO public.aigc_detect_queue (application_id, status, next_run_at, attempts, last_error, locked_at)
    VALUES (NEW.id, 'queued', now(), 0, NULL, NULL)
    ON CONFLICT (application_id) DO UPDATE
      SET status='queued', next_run_at=now(), attempts=0, last_error=NULL, locked_at=NULL, updated_at=now();
  END IF;
  RETURN NEW;
END $function$;