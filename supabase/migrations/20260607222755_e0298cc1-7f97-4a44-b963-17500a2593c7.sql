-- Scope compliance-docs storage policies to mission membership.
-- Files in this bucket are expected to use a path that starts with the
-- mission_id (e.g. "<mission_id>/...") just like mission-documents.
DROP POLICY IF EXISTS "compliance_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "compliance_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "compliance_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "compliance_storage_delete" ON storage.objects;

CREATE POLICY "Mission members read compliance-docs storage"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'compliance-docs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.user_id = auth.uid()
        AND (mm.mission_id)::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

CREATE POLICY "Mission members insert compliance-docs storage"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'compliance-docs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.user_id = auth.uid()
        AND (mm.mission_id)::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

CREATE POLICY "Mission members update compliance-docs storage"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'compliance-docs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.user_id = auth.uid()
        AND (mm.mission_id)::text = split_part(storage.objects.name, '/', 1)
    )
  )
)
WITH CHECK (
  bucket_id = 'compliance-docs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.user_id = auth.uid()
        AND (mm.mission_id)::text = split_part(storage.objects.name, '/', 1)
    )
  )
);

CREATE POLICY "Mission members delete compliance-docs storage"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'compliance-docs'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.user_id = auth.uid()
        AND (mm.mission_id)::text = split_part(storage.objects.name, '/', 1)
    )
  )
);