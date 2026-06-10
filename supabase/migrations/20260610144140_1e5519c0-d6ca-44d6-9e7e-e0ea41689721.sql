
-- 1. Disclaimer field on missions
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS iris_disclaimer text;

-- 2. Helper: is mission creator
CREATE OR REPLACE FUNCTION public.is_mission_creator(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.missions
    WHERE id = _mission_id AND created_by = _user_id
  );
$$;

-- 3. Additive RLS policies giving the mission creator full access during setup.
-- mission_volumes
DROP POLICY IF EXISTS creator_all_mv ON public.mission_volumes;
CREATE POLICY creator_all_mv ON public.mission_volumes FOR ALL
  USING (public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_creator(mission_id, auth.uid()));

-- mission_sections
DROP POLICY IF EXISTS creator_all_ms ON public.mission_sections;
CREATE POLICY creator_all_ms ON public.mission_sections FOR ALL
  USING (public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_creator(mission_id, auth.uid()));

-- mission_questions
DROP POLICY IF EXISTS creator_all_mq ON public.mission_questions;
CREATE POLICY creator_all_mq ON public.mission_questions FOR ALL
  USING (public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_creator(mission_id, auth.uid()));

-- mission_compliance_requirements
DROP POLICY IF EXISTS creator_all_mcr ON public.mission_compliance_requirements;
CREATE POLICY creator_all_mcr ON public.mission_compliance_requirements FOR ALL
  USING (public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_creator(mission_id, auth.uid()));

-- mission_submission_checklist
DROP POLICY IF EXISTS creator_all_msc ON public.mission_submission_checklist;
CREATE POLICY creator_all_msc ON public.mission_submission_checklist FOR ALL
  USING (public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_creator(mission_id, auth.uid()));

-- mission_documents
DROP POLICY IF EXISTS creator_all_mdocs ON public.mission_documents;
CREATE POLICY creator_all_mdocs ON public.mission_documents FOR ALL
  USING (public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_creator(mission_id, auth.uid()));

-- 4. Storage RLS for atlas-rfp-documents bucket.
-- Path layout: <mission_id>/<timestamp>-<filename>
-- Anyone may read (bucket is public); authenticated users may upload/manage
-- files in missions they created or admin or team-member on.
DROP POLICY IF EXISTS atlas_rfp_public_read ON storage.objects;
CREATE POLICY atlas_rfp_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'atlas-rfp-documents');

DROP POLICY IF EXISTS atlas_rfp_authed_write ON storage.objects;
CREATE POLICY atlas_rfp_authed_write ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'atlas-rfp-documents'
    AND auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_mission_creator((split_part(name, '/', 1))::uuid, auth.uid())
      OR public.is_mission_member_user((split_part(name, '/', 1))::uuid, auth.uid())
    )
  );

DROP POLICY IF EXISTS atlas_rfp_authed_update ON storage.objects;
CREATE POLICY atlas_rfp_authed_update ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'atlas-rfp-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_mission_creator((split_part(name, '/', 1))::uuid, auth.uid())
      OR public.is_mission_member_user((split_part(name, '/', 1))::uuid, auth.uid())
    )
  );

DROP POLICY IF EXISTS atlas_rfp_authed_delete ON storage.objects;
CREATE POLICY atlas_rfp_authed_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'atlas-rfp-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_mission_creator((split_part(name, '/', 1))::uuid, auth.uid())
      OR public.is_mission_member_user((split_part(name, '/', 1))::uuid, auth.uid())
    )
  );
