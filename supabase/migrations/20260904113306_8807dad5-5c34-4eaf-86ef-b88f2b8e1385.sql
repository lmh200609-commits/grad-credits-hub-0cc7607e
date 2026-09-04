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

CREATE POLICY "Students manage own attachments" ON public.application_attachments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.student_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.applications a WHERE a.id = application_id AND a.student_id = auth.uid()));

CREATE POLICY "Staff read college attachments" ON public.application_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.applications a
    WHERE a.id = application_id
      AND (public.is_super_admin(auth.uid())
           OR (public.has_role(auth.uid(), 'admin'::app_role) AND a.college_id IS NOT DISTINCT FROM public.current_user_college_id())
           OR (public.has_role(auth.uid(), 'teacher'::app_role) AND a.college_id IS NOT DISTINCT FROM public.current_user_college_id()))
  ));