
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='atlas_docs_auth_all') THEN
    CREATE POLICY atlas_docs_auth_all ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id IN ('atlas-rfp-documents','atlas-intelligence'))
      WITH CHECK (bucket_id IN ('atlas-rfp-documents','atlas-intelligence'));
  END IF;
END $$;
