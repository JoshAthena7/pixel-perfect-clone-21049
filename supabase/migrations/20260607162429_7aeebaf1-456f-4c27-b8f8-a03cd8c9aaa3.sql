CREATE POLICY "Mission members can view their mission logos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'mission-logos'
  AND EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.mission_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Mission members can upload mission logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'mission-logos'
  AND EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.mission_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Mission members can update mission logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'mission-logos'
  AND EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.mission_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Mission members can delete mission logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'mission-logos'
  AND EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.user_id = auth.uid()
      AND mm.mission_id::text = (storage.foldername(name))[1]
  )
);