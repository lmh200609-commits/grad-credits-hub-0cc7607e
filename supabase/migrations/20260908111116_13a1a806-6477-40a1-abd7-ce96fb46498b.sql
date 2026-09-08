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