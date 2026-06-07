
-- 1. Tighten broadcasts SELECT: global broadcasts (mission_id IS NULL) admin-only
DROP POLICY IF EXISTS "bc_select" ON public.broadcasts;
CREATE POLICY "bc_select" ON public.broadcasts
FOR SELECT TO authenticated
USING (
  (mission_id IS NOT NULL AND public.is_mission_member(mission_id, auth.uid()))
  OR (mission_id IS NULL AND public.has_role(auth.uid(), 'admin'::public.app_role))
);

-- 2. checkin_tokens: RLS enabled but no policy. Add admin-only SELECT/manage policy
--    (service_role bypasses RLS, so existing token-validation flows are unaffected).
CREATE POLICY "checkin_tokens admin manage" ON public.checkin_tokens
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. email_send_log: defence-in-depth restrictive policy blocking non-admin
--    authenticated reads even if a future permissive policy is added.
CREATE POLICY "email_send_log deny non-admin reads" ON public.email_send_log
AS RESTRICTIVE
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
