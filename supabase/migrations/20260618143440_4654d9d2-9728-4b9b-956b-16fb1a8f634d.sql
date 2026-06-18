DROP POLICY IF EXISTS atlas_resumes_auth_select ON storage.objects;
CREATE POLICY atlas_resumes_owner_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'atlas-resumes'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_role(auth.uid(), 'admin')
  )
);