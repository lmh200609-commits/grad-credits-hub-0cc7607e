CREATE OR REPLACE FUNCTION public.delete_application(_app_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_college uuid;
  v_paths text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  SELECT college_id INTO v_college FROM public.applications WHERE id = _app_id;
  IF NOT FOUND THEN RAISE EXCEPTION '申请不存在或已被删除'; END IF;
  IF NOT (public.is_super_admin(v_uid)
          OR (public.has_role(v_uid, 'admin'::app_role)
              AND v_college IS NOT DISTINCT FROM public.current_user_college_id())) THEN
    RAISE EXCEPTION '没有删除该申请的权限';
  END IF;

  SELECT array_remove(array_agg(DISTINCT p), NULL) INTO v_paths FROM (
    SELECT file_path AS p FROM public.application_attachments WHERE application_id = _app_id
    UNION ALL SELECT file_path FROM public.applications WHERE id = _app_id
    UNION ALL SELECT form_file_path FROM public.applications WHERE id = _app_id
  ) t;

  DELETE FROM public.application_attachments WHERE application_id = _app_id;
  DELETE FROM public.application_reviews WHERE application_id = _app_id;
  DELETE FROM public.ai_eval_queue WHERE application_id = _app_id;
  DELETE FROM public.ai_eval_failures WHERE application_id = _app_id;
  DELETE FROM public.aigc_detect_queue WHERE application_id = _app_id;
  DELETE FROM public.aigc_detect_failures WHERE application_id = _app_id;
  DELETE FROM public.submission_records WHERE application_id = _app_id;
  DELETE FROM public.applications WHERE id = _app_id;

  RETURN coalesce(v_paths, '{}');
END $$;

REVOKE ALL ON FUNCTION public.delete_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_application(uuid) TO authenticated;