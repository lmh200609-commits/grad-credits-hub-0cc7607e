-- ============================================================
-- 综合素质学分认定系统 自托管增量更新 SQL（2026-10 版）
-- 用途：把 2026-09 以后的所有数据库改动一次性补到自托管 Supabase
-- 特点：可重复执行（重复跑不会报错、不会重复建表/策略）
-- 执行方式（二选一）：
--   A. 自托管 Studio（http://172.20.10.10/supabase）→ SQL Editor → 粘贴全部内容 → Run
--   B. 服务器命令行：
--      docker exec -i supabase-db psql -U postgres < /path/to/update-2026-10.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ========== 来自迁移 20260904113306_ ==========
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS item_category text,
  ADD COLUMN IF NOT EXISTS item_project text,
  ADD COLUMN IF NOT EXISTS achievement_name text,
  ADD COLUMN IF NOT EXISTS level_name text,
  ADD COLUMN IF NOT EXISTS self_rank text,
  ADD COLUMN IF NOT EXISTS claimed_credit numeric,
  ADD COLUMN IF NOT EXISTS form_file_path text;

CREATE TABLE IF NOT EXISTS public.application_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_hash text,
  order_index integer NOT NULL DEFAULT 0,
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.application_attachments TO authenticated;
GRANT ALL ON public.application_attachments TO service_role;
ALTER TABLE public.application_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students manage own attachments" ON public.application_attachments;
CREATE POLICY "Students manage own attachments" ON public.application_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.student_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.student_id = auth.uid()));

DROP POLICY IF EXISTS "Staff read college attachments" ON public.application_attachments;
CREATE POLICY "Staff read college attachments" ON public.application_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = application_id
      AND (public.is_super_admin(auth.uid())
           OR (public.has_role(auth.uid(), 'admin'::app_role) AND a.college_id IS NOT DISTINCT FROM public.current_user_college_id())
           OR (public.has_role(auth.uid(), 'teacher'::app_role) AND a.college_id IS NOT DISTINCT FROM public.current_user_college_id()))
  ));

-- ========== 来自迁移 20260904114810_ ==========
-- 1) applications 新增标准学分 / 合规标记
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS credit_standard numeric,
  ADD COLUMN IF NOT EXISTS credit_compliance text;

-- 2) 学生更新防护：新填报字段学生不可改
CREATE OR REPLACE FUNCTION public.applications_student_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_caller = OLD.student_id
     AND NOT public.has_role(v_caller, 'teacher'::app_role)
     AND NOT public.has_role(v_caller, 'admin'::app_role) THEN

    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      RAISE EXCEPTION 'students cannot change student_id';
    END IF;

    NEW.status := OLD.status;
    NEW.ai_matched_rule_id := OLD.ai_matched_rule_id;
    NEW.ai_suggested_credit := OLD.ai_suggested_credit;
    NEW.ai_confidence := OLD.ai_confidence;
    NEW.ai_reasoning := OLD.ai_reasoning;
    NEW.ai_reasoning_short := OLD.ai_reasoning_short;
    NEW.ai_check_consistency := OLD.ai_check_consistency;
    NEW.ai_check_completeness := OLD.ai_check_completeness;
    NEW.ai_check_logic := OLD.ai_check_logic;
    NEW.ai_check_identity_match := OLD.ai_check_identity_match;
    NEW.ai_check_name_match := OLD.ai_check_name_match;
    NEW.ai_check_authenticity := OLD.ai_check_authenticity;
    NEW.ai_check_relevance := OLD.ai_check_relevance;
    NEW.ai_blank_fields := OLD.ai_blank_fields;
    NEW.ai_logic_issue := OLD.ai_logic_issue;
    NEW.ai_identity_mismatch := OLD.ai_identity_mismatch;
    NEW.ai_detected_school := OLD.ai_detected_school;
    NEW.ai_detected_student_no := OLD.ai_detected_student_no;
    NEW.ai_detected_identity := OLD.ai_detected_identity;
    NEW.ai_detected_level := OLD.ai_detected_level;
    NEW.ai_detected_achievement := OLD.ai_detected_achievement;
    NEW.ai_detected_project := OLD.ai_detected_project;
    NEW.ai_override_note := OLD.ai_override_note;
    NEW.ai_previous_snapshot := OLD.ai_previous_snapshot;
    NEW.ai_last_attempt_at := OLD.ai_last_attempt_at;
    NEW.ai_last_error := OLD.ai_last_error;

    NEW.final_credit := OLD.final_credit;
    NEW.final_review_note := OLD.final_review_note;
    NEW.final_reviewer_id := OLD.final_reviewer_id;
    NEW.review_source := OLD.review_source;
    NEW.reviewed_at := OLD.reviewed_at;

    NEW.certificate_no := OLD.certificate_no;
    NEW.certificate_issued_at := OLD.certificate_issued_at;

    NEW.face_match_status := OLD.face_match_status;
    NEW.face_match_score := OLD.face_match_score;
    NEW.face_match_note := OLD.face_match_note;
    NEW.face_checked_at := OLD.face_checked_at;

    NEW.submitted_at := OLD.submitted_at;
    NEW.created_at := OLD.created_at;

    NEW.file_hash := OLD.file_hash;
    NEW.keywords_fingerprint := OLD.keywords_fingerprint;

    -- 新填报流程字段：学生提交后不可改
    NEW.item_category := OLD.item_category;
    NEW.item_project := OLD.item_project;
    NEW.achievement_name := OLD.achievement_name;
    NEW.level_name := OLD.level_name;
    NEW.self_rank := OLD.self_rank;
    NEW.claimed_credit := OLD.claimed_credit;
    NEW.form_file_path := OLD.form_file_path;
    NEW.credit_standard := OLD.credit_standard;
    NEW.credit_compliance := OLD.credit_compliance;
  END IF;

  RETURN NEW;
END;
$function$;

-- 3) 去重守卫：改为「同一学生 + 同一成果名称 + 同一级别 且已通过」才拦截；不按认定项目拦截
CREATE OR REPLACE FUNCTION public.applications_dedupe_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_role text := current_user;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_role IN ('postgres','service_role','supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF public.has_role(v_caller, 'teacher'::app_role)
     OR public.has_role(v_caller, 'admin'::app_role)
     OR public.is_super_admin(v_caller) THEN
    RETURN NEW;
  END IF;

  IF NEW.file_hash IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.applications
      WHERE file_hash = NEW.file_hash AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION '该图片已被提交过，请勿重复使用' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.keywords_fingerprint IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.applications
      WHERE student_id = NEW.student_id
        AND keywords_fingerprint = NEW.keywords_fingerprint
        AND status IN ('approved','auto_approved')
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION '该成果已认定通过，同一成果只认定最高级别，无需重复提交' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ========== 来自迁移 20260904120602_ ==========
ALTER TABLE public.application_attachments ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE public.application_attachments ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- ========== 来自迁移 20260908111116_ ==========
CREATE POLICY "cases teacher insert own college"
ON public.cases FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND college_id = current_user_college_id());

CREATE POLICY "keywords teacher insert own college"
ON public.keywords FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND college_id = current_user_college_id());

CREATE POLICY "keywords teacher update own college"
ON public.keywords FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'teacher'::app_role) AND college_id = current_user_college_id())
WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND college_id = current_user_college_id());

-- ========== 来自迁移 20260909101852_ ==========
CREATE TABLE IF NOT EXISTS public.competition_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id uuid REFERENCES public.colleges(id) ON DELETE CASCADE,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT '学科竞赛',
  default_level text,
  default_credit numeric,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.certificate_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  college_id uuid REFERENCES public.colleges(id) ON DELETE CASCADE,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  cert_class text NOT NULL DEFAULT '从业资格证书',
  level text,
  issuer text,
  default_credit numeric,
  note text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_catalog TO authenticated;
GRANT ALL ON public.competition_catalog TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificate_catalog TO authenticated;
GRANT ALL ON public.certificate_catalog TO service_role;

ALTER TABLE public.competition_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificate_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "competition_catalog_read" ON public.competition_catalog;
CREATE POLICY "competition_catalog_read" ON public.competition_catalog
  FOR SELECT TO authenticated
  USING (college_id IS NULL OR college_id = public.current_user_college_id() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "competition_catalog_admin_write" ON public.competition_catalog;
CREATE POLICY "competition_catalog_admin_write" ON public.competition_catalog
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()));

DROP POLICY IF EXISTS "certificate_catalog_read" ON public.certificate_catalog;
CREATE POLICY "certificate_catalog_read" ON public.certificate_catalog
  FOR SELECT TO authenticated
  USING (college_id IS NULL OR college_id = public.current_user_college_id() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "certificate_catalog_admin_write" ON public.certificate_catalog;
CREATE POLICY "certificate_catalog_admin_write" ON public.certificate_catalog
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()));

CREATE INDEX IF NOT EXISTS idx_competition_catalog_college ON public.competition_catalog(college_id);
CREATE INDEX IF NOT EXISTS idx_certificate_catalog_college ON public.certificate_catalog(college_id);
CREATE INDEX IF NOT EXISTS idx_competition_catalog_name_trgm ON public.competition_catalog USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_certificate_catalog_name_trgm ON public.certificate_catalog USING gin (name gin_trgm_ops);

DROP TRIGGER IF EXISTS update_competition_catalog_updated_at ON UPDATE;
CREATE TRIGGER update_competition_catalog_updated_at
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS update_certificate_catalog_updated_at ON UPDATE;
CREATE TRIGGER update_certificate_catalog_updated_at
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.clone_template_to_college(_college uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  IF _college IS NULL THEN RETURN; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.competition_catalog WHERE college_id = _college) THEN
    INSERT INTO public.competition_catalog(college_id, name, aliases, category, default_level, default_credit, note, active, created_by)
    SELECT _college, name, aliases, category, default_level, default_credit, note, active, created_by
    FROM public.competition_catalog WHERE college_id IS NULL;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.certificate_catalog WHERE college_id = _college) THEN
    INSERT INTO public.certificate_catalog(college_id, name, aliases, cert_class, level, issuer, default_credit, note, active, created_by)
    SELECT _college, name, aliases, cert_class, level, issuer, default_credit, note, active, created_by
    FROM public.certificate_catalog WHERE college_id IS NULL;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.rules    WHERE college_id = _college)
      OR EXISTS(SELECT 1 FROM public.cases    WHERE college_id = _college)
      OR EXISTS(SELECT 1 FROM public.keywords WHERE college_id = _college)
  INTO v_exists;
  IF v_exists THEN RETURN; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _rule_map(old_id uuid, new_id uuid) ON COMMIT DROP;
  TRUNCATE _rule_map;

  WITH ins AS (
    INSERT INTO public.rules(
      college_id, name, category, identity, level, achievement, project,
      description, credit, keywords, active, created_by
    )
    SELECT _college, name, category, identity, level, achievement, project,
           description, credit, keywords, active, created_by
    FROM public.rules
    WHERE college_id IS NULL
    RETURNING id, name, coalesce(category,'') AS c, coalesce(identity,'') AS i,
              coalesce(level,'') AS l, coalesce(achievement,'') AS a, coalesce(project,'') AS p, credit
  ),
  src AS (
    SELECT id AS old_id, name, coalesce(category,'') AS c, coalesce(identity,'') AS i,
           coalesce(level,'') AS l, coalesce(achievement,'') AS a, coalesce(project,'') AS p, credit,
           row_number() OVER (PARTITION BY name, coalesce(category,''), coalesce(identity,''),
                              coalesce(level,''), coalesce(achievement,''), coalesce(project,''), credit
                              ORDER BY id) AS rn
    FROM public.rules WHERE college_id IS NULL
  ),
  dst AS (
    SELECT id AS new_id, name, c, i, l, a, p, credit,
           row_number() OVER (PARTITION BY name, c, i, l, a, p, credit ORDER BY id) AS rn
    FROM ins
  )
  INSERT INTO _rule_map(old_id, new_id)
  SELECT s.old_id, d.new_id
  FROM src s JOIN dst d
    ON s.name=d.name AND s.c=d.c AND s.i=d.i AND s.l=d.l AND s.a=d.a AND s.p=d.p AND s.credit=d.credit AND s.rn=d.rn;

  INSERT INTO public.cases(college_id, title, summary, rule_id, awarded_credit, notes, created_by)
  SELECT _college, c.title, c.summary, m.new_id, c.awarded_credit, c.notes, c.created_by
  FROM public.cases c
  LEFT JOIN _rule_map m ON m.old_id = c.rule_id
  WHERE c.college_id IS NULL;

  INSERT INTO public.keywords(college_id, keyword, category, source, usage_count, active, created_by)
  SELECT _college, keyword, category, source, usage_count, active, created_by
  FROM public.keywords
  WHERE college_id IS NULL
  ON CONFLICT DO NOTHING;
END $function$;

-- ========== 来自迁移 20261008122525_ ==========
REVOKE EXECUTE ON FUNCTION public.colleges_seed_libraries() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.applications_dedupe_guard() FROM anon, public;
DO $$ DECLARE r record; BEGIN
FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='clone_template_to_college' LOOP
 EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
END LOOP; END $$;

-- ========== 来自迁移 20261008130921_ ==========
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

-- ========== 存储策略：学生可删除自己目录下的残留文件（提交失败自动清理依赖此权限） ==========
DROP POLICY IF EXISTS "app files student delete own" ON storage.objects;
CREATE POLICY "app files student delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'application-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND array_length(storage.foldername(name), 1) = 1
  );
