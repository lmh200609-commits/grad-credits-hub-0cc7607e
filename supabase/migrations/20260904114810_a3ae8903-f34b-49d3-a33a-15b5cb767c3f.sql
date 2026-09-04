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