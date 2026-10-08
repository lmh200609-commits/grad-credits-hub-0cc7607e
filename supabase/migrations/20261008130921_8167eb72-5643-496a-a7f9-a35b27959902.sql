CREATE OR REPLACE FUNCTION public.submit_application(_app jsonb, _attachments jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '请先登录'; END IF;
  IF _attachments IS NULL OR jsonb_array_length(_attachments) = 0 THEN
    RAISE EXCEPTION '请至少上传 1 张佐证材料图片';
  END IF;
  IF coalesce(_app->>'form_file_path','') = '' THEN RAISE EXCEPTION '申请表未上传'; END IF;

  INSERT INTO public.applications (
    student_id, description, selected_keywords, custom_keywords, file_path, file_hash, form_file_path,
    item_category, item_project, achievement_name, level_name, self_rank, claimed_credit,
    credit_standard, credit_compliance, keywords_fingerprint, status
  ) VALUES (
    auth.uid(), _app->>'description',
    coalesce(ARRAY(SELECT jsonb_array_elements_text(_app->'selected_keywords')), '{}'),
    coalesce(ARRAY(SELECT jsonb_array_elements_text(_app->'custom_keywords')), '{}'),
    _attachments->0->>'file_path', _attachments->0->>'file_hash', _app->>'form_file_path',
    _app->>'item_category', _app->>'item_project', _app->>'achievement_name', _app->>'level_name',
    _app->>'self_rank', nullif(_app->>'claimed_credit','')::numeric,
    nullif(_app->>'credit_standard','')::numeric, _app->>'credit_compliance',
    _app->>'keywords_fingerprint', 'pending_ai'
  ) RETURNING id INTO _id;

  INSERT INTO public.application_attachments (application_id, file_path, file_name, file_hash, sort_order)
  SELECT _id, a->>'file_path', a->>'file_name', a->>'file_hash', (ord - 1)::int
  FROM jsonb_array_elements(_attachments) WITH ORDINALITY AS t(a, ord);

  RETURN _id;
END $$;
REVOKE ALL ON FUNCTION public.submit_application(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_application(jsonb, jsonb) TO authenticated;