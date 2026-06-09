-- Atlas onboarding storage policies for atlas-avatars and atlas-resumes buckets.
-- Authenticated users can manage their own files; platform admins can manage all.

-- ATLAS AVATARS
CREATE POLICY "atlas_avatars_auth_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'atlas-avatars');

CREATE POLICY "atlas_avatars_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'atlas-avatars');

CREATE POLICY "atlas_avatars_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'atlas-avatars')
  WITH CHECK (bucket_id = 'atlas-avatars');

CREATE POLICY "atlas_avatars_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'atlas-avatars');

-- ATLAS RESUMES
CREATE POLICY "atlas_resumes_auth_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'atlas-resumes');

CREATE POLICY "atlas_resumes_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'atlas-resumes');

CREATE POLICY "atlas_resumes_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'atlas-resumes')
  WITH CHECK (bucket_id = 'atlas-resumes');

CREATE POLICY "atlas_resumes_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'atlas-resumes');