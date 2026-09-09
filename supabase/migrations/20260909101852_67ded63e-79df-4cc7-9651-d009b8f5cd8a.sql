CREATE TABLE public.competition_catalog (
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

CREATE TABLE public.certificate_catalog (
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

CREATE POLICY "competition_catalog_read" ON public.competition_catalog
  FOR SELECT TO authenticated
  USING (college_id IS NULL OR college_id = public.current_user_college_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "competition_catalog_admin_write" ON public.competition_catalog
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()));

CREATE POLICY "certificate_catalog_read" ON public.certificate_catalog
  FOR SELECT TO authenticated
  USING (college_id IS NULL OR college_id = public.current_user_college_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "certificate_catalog_admin_write" ON public.certificate_catalog
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND college_id = public.current_user_college_id()));

CREATE INDEX idx_competition_catalog_college ON public.competition_catalog(college_id);
CREATE INDEX idx_certificate_catalog_college ON public.certificate_catalog(college_id);
CREATE INDEX idx_competition_catalog_name_trgm ON public.competition_catalog USING gin (name gin_trgm_ops);
CREATE INDEX idx_certificate_catalog_name_trgm ON public.certificate_catalog USING gin (name gin_trgm_ops);

CREATE TRIGGER update_competition_catalog_updated_at BEFORE UPDATE ON public.competition_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_certificate_catalog_updated_at BEFORE UPDATE ON public.certificate_catalog
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