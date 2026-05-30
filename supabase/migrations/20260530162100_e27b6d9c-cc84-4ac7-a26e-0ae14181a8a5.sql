
-- 1. Leadership check used by transactional email endpoint
CREATE OR REPLACE FUNCTION public.user_has_any_leadership_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE user_id = _user_id
      AND role IN ('founder','pm','engagement_lead')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_any_leadership_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_any_leadership_role(uuid) TO authenticated, service_role;

-- 2. Add NDA gate to intel-files storage policies
DROP POLICY IF EXISTS intel_files_member_read   ON storage.objects;
DROP POLICY IF EXISTS intel_files_member_write  ON storage.objects;
DROP POLICY IF EXISTS intel_files_member_update ON storage.objects;
DROP POLICY IF EXISTS intel_files_member_delete ON storage.objects;

CREATE POLICY intel_files_member_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
  AND private.nda_gate_ok(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY intel_files_member_write ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
  AND private.nda_gate_ok(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY intel_files_member_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
  AND private.nda_gate_ok(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
  AND private.nda_gate_ok(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY intel_files_member_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'intel-files'
  AND private.is_engagement_member(((storage.foldername(name))[1])::uuid)
  AND private.nda_gate_ok(((storage.foldername(name))[1])::uuid)
);

-- 3. Restrict slack_webhook column on engagements.
--    Currently table-level SELECT is granted to authenticated/anon, which
--    overrides column-level revokes. Revoke table-level SELECT, then re-grant
--    SELECT only on non-sensitive columns. Other DML (INSERT/UPDATE/DELETE)
--    grants are preserved so leadership UPDATE policy still works; UPDATE
--    of slack_webhook continues to flow via the security-definer RPC
--    `get_engagement_slack_webhook` and admin code only.
REVOKE SELECT ON public.engagements FROM anon, authenticated;
GRANT SELECT (
  id, name, client, submission_date, status, created_at, created_by,
  state, market, engagement_type, contract_value_estimate
) ON public.engagements TO authenticated;
-- anon has no policy that returns rows; keep no SELECT grant for anon.
