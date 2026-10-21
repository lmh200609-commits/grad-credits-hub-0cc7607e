DROP POLICY IF EXISTS "reviews insert by reviewer" ON public.application_reviews;
CREATE POLICY "reviews insert by reviewer" ON public.application_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = (SELECT auth.uid())
    AND (
      public.is_super_admin((SELECT auth.uid()))
      OR ((public.has_role((SELECT auth.uid()), 'teacher'::app_role) OR public.has_role((SELECT auth.uid()), 'admin'::app_role))
          AND EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id
                      AND a.college_id IS NOT DISTINCT FROM public.current_user_college_id()))
    )
  );

DROP POLICY IF EXISTS "certificate_types admin manage" ON public.certificate_types;
CREATE POLICY "certificate_types admin manage" ON public.certificate_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "rule_library admin manage" ON public.rule_library;
CREATE POLICY "rule_library admin manage" ON public.rule_library FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.ai_encrypt_api_key(_plain text, _secret text)
 RETURNS TABLE(encrypted text, last4 text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE _role text := current_user;
BEGIN
  IF _role NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid())) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  IF _plain IS NULL OR length(_plain) = 0 THEN RAISE EXCEPTION 'empty key'; END IF;
  IF _secret IS NULL OR length(_secret) < 8 THEN RAISE EXCEPTION 'weak secret'; END IF;
  RETURN QUERY SELECT encode(extensions.pgp_sym_encrypt(_plain, _secret), 'base64')::text, right(_plain, 4);
END;
$function$;

CREATE OR REPLACE FUNCTION public.gen_certificate_no(_app_id uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_year text := to_char(now(), 'YYYY'); v_seq int; v_no text; v_student uuid; v_status text;
  v_caller uuid := auth.uid();
BEGIN
  SELECT student_id, status::text, certificate_no INTO v_student, v_status, v_no
  FROM public.applications WHERE id = _app_id;
  IF v_student IS NULL THEN RAISE EXCEPTION 'application not found'; END IF;
  IF v_caller IS NULL
     OR (v_caller <> v_student
         AND NOT public.has_role(v_caller, 'teacher'::app_role)
         AND NOT public.has_role(v_caller, 'admin'::app_role)
         AND NOT public.is_super_admin(v_caller)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_no IS NOT NULL THEN RETURN v_no; END IF;
  IF v_status NOT IN ('approved', 'auto_approved') THEN RAISE EXCEPTION 'application not approved'; END IF;
  SELECT count(*) + 1 INTO v_seq FROM public.applications WHERE certificate_no LIKE v_year || '-%';
  v_no := v_year || '-' || lpad(v_seq::text, 4, '0');
  UPDATE public.applications SET certificate_no = v_no, certificate_issued_at = now() WHERE id = _app_id;
  RETURN v_no;
END;
$function$;