CREATE POLICY "app files admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'application-files' AND (
  public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id::text = (storage.foldername(name))[1]
      AND p.college_id IS NOT DISTINCT FROM public.current_user_college_id()))
));