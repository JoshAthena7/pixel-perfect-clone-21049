
-- =========================================================================
-- AVATARS: scope writes to own folder
-- =========================================================================
DROP POLICY IF EXISTS atlas_avatars_auth_update ON storage.objects;
DROP POLICY IF EXISTS atlas_avatars_auth_delete ON storage.objects;

CREATE POLICY atlas_avatars_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'atlas-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY atlas_avatars_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'atlas-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'atlas-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY atlas_avatars_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'atlas-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =========================================================================
-- RESUMES: scope writes to own folder
-- =========================================================================
DROP POLICY IF EXISTS atlas_resumes_auth_update ON storage.objects;
DROP POLICY IF EXISTS atlas_resumes_auth_delete ON storage.objects;

CREATE POLICY atlas_resumes_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'atlas-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY atlas_resumes_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'atlas-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'atlas-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY atlas_resumes_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'atlas-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- =========================================================================
-- INTELLIGENCE + RFP DOCS: replace blanket ALL with bucket/mission scoping
-- =========================================================================
DROP POLICY IF EXISTS atlas_docs_auth_all ON storage.objects;
DROP POLICY IF EXISTS atlas_rfp_public_read ON storage.objects;

-- atlas-intelligence: mission members only
CREATE POLICY atlas_intel_select_members ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'atlas-intelligence'
    AND public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
CREATE POLICY atlas_intel_insert_members ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'atlas-intelligence'
    AND public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
CREATE POLICY atlas_intel_update_members ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'atlas-intelligence'
    AND public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
  )
  WITH CHECK (
    bucket_id = 'atlas-intelligence'
    AND public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
  );
CREATE POLICY atlas_intel_delete_members ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'atlas-intelligence'
    AND public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

-- atlas-rfp-documents: authenticated, mission-scoped read + insert
-- (matching existing update/delete pattern using has_role/is_mission_creator/is_mission_member_user)
CREATE POLICY atlas_rfp_authed_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'atlas-rfp-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.is_mission_creator((split_part(name, '/', 1))::uuid, auth.uid())
      OR public.is_mission_member_user((split_part(name, '/', 1))::uuid, auth.uid())
    )
  );
CREATE POLICY atlas_rfp_authed_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'atlas-rfp-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.is_mission_creator((split_part(name, '/', 1))::uuid, auth.uid())
      OR public.is_mission_member_user((split_part(name, '/', 1))::uuid, auth.uid())
    )
  );

-- =========================================================================
-- INCIDENT RESPONSE PLAN: admin-only reads
-- =========================================================================
DROP POLICY IF EXISTS irp_read_authenticated ON public.incident_response_plan;
CREATE POLICY irp_admin_read ON public.incident_response_plan
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
