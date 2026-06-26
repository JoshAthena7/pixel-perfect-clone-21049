CREATE OR REPLACE FUNCTION public.can_access_mission(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.is_mission_creator(_mission_id, _user_id)
    OR public.is_mission_member(_mission_id, _user_id);
$$;

DROP POLICY IF EXISTS admin_or_team_select_mdocs ON public.mission_documents;
DROP POLICY IF EXISTS admin_or_team_write_mdocs ON public.mission_documents;
DROP POLICY IF EXISTS creator_all_mdocs ON public.mission_documents;

CREATE POLICY "Mission users can read mission documents"
ON public.mission_documents
FOR SELECT
TO authenticated
USING (public.can_access_mission(mission_id, auth.uid()));

CREATE POLICY "Mission users can create mission documents"
ON public.mission_documents
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_mission(mission_id, auth.uid()));

CREATE POLICY "Mission users can update mission documents"
ON public.mission_documents
FOR UPDATE
TO authenticated
USING (public.can_access_mission(mission_id, auth.uid()))
WITH CHECK (public.can_access_mission(mission_id, auth.uid()));

CREATE POLICY "Mission users can delete mission documents"
ON public.mission_documents
FOR DELETE
TO authenticated
USING (public.can_access_mission(mission_id, auth.uid()));

DROP POLICY IF EXISTS atlas_rfp_authed_read ON storage.objects;
DROP POLICY IF EXISTS atlas_rfp_authed_insert ON storage.objects;
DROP POLICY IF EXISTS atlas_rfp_authed_write ON storage.objects;
DROP POLICY IF EXISTS atlas_rfp_authed_update ON storage.objects;
DROP POLICY IF EXISTS atlas_rfp_authed_delete ON storage.objects;

CREATE POLICY atlas_rfp_mission_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'atlas-rfp-documents'
  AND public.can_access_mission((split_part(name, '/', 1))::uuid, auth.uid())
);

CREATE POLICY atlas_rfp_mission_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'atlas-rfp-documents'
  AND public.can_access_mission((split_part(name, '/', 1))::uuid, auth.uid())
);

CREATE POLICY atlas_rfp_mission_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'atlas-rfp-documents'
  AND public.can_access_mission((split_part(name, '/', 1))::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'atlas-rfp-documents'
  AND public.can_access_mission((split_part(name, '/', 1))::uuid, auth.uid())
);

CREATE POLICY atlas_rfp_mission_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'atlas-rfp-documents'
  AND public.can_access_mission((split_part(name, '/', 1))::uuid, auth.uid())
);

ALTER TABLE public.mission_documents DROP CONSTRAINT IF EXISTS mission_documents_purpose_check;
ALTER TABLE public.mission_documents ADD CONSTRAINT mission_documents_purpose_check
  CHECK (document_purpose = ANY (ARRAY[
    'procurement','competitive_intel','writing_standards','client_strategy','reference','response_outline'
  ]));