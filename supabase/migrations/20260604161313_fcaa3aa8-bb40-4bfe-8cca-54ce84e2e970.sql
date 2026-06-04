-- Tighten olympus_audit_log INSERT: admin role required (defense-in-depth backstop
-- to app-layer assertAdmin checks in grantPlatformAdmin / revokePlatformAdmin /
-- acknowledgeConflict). Prevents non-admins from forging audit rows even if a
-- future server fn forgets to call assertAdmin.
DROP POLICY IF EXISTS oal_insert_members ON public.olympus_audit_log;

CREATE POLICY oal_insert_admin
  ON public.olympus_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND user_id = auth.uid()
  );