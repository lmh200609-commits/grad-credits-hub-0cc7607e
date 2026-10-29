CREATE OR REPLACE FUNCTION public.delete_college(_college uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n_users int; n_apps int;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION '只有超级管理员可以删除学院'; END IF;
  SELECT count(DISTINCT user_id) INTO n_users FROM (
    SELECT user_id FROM public.user_roles WHERE college_id = _college
    UNION SELECT user_id FROM public.profiles WHERE college_id = _college) t;
  SELECT count(*) INTO n_apps FROM public.applications WHERE college_id = _college;
  IF n_users > 0 OR n_apps > 0 THEN
    RAISE EXCEPTION '该学院下还有 % 个账号、% 份申请，不能删除；如不再使用，请改为停用', n_users, n_apps;
  END IF;
  DELETE FROM public.submission_window_reports WHERE college_id = _college;
  DELETE FROM public.submission_windows WHERE college_id = _college;
  DELETE FROM public.cases WHERE college_id = _college;
  DELETE FROM public.keywords WHERE college_id = _college;
  DELETE FROM public.certificate_catalog WHERE college_id = _college;
  DELETE FROM public.competition_catalog WHERE college_id = _college;
  DELETE FROM public.rules WHERE college_id = _college;
  DELETE FROM public.colleges WHERE id = _college;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.delete_college(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_college(uuid) TO authenticated;