
-- 1) Security-definer views → security-invoker
ALTER VIEW public.profiles_directory SET (security_invoker = true);
ALTER VIEW public.pulse_aggregates SET (security_invoker = true);
ALTER VIEW public.collective_memory_sanitized SET (security_invoker = true);

-- 2) collective_members: restrict SELECT to platform admins (PII)
DROP POLICY IF EXISTS "collective_select_authenticated" ON public.collective_members;
CREATE POLICY "collective_select_admin" ON public.collective_members
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 3) compliance_requirements & compliance_check_results: scope to authenticated role
DROP POLICY IF EXISTS "Mission members can view compliance requirements" ON public.compliance_requirements;
DROP POLICY IF EXISTS "Mission leads can manage compliance requirements" ON public.compliance_requirements;
CREATE POLICY "Mission members can view compliance requirements"
  ON public.compliance_requirements
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "Mission leads can manage compliance requirements"
  ON public.compliance_requirements
  FOR ALL TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin'::text, 'lead'::text]))
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin'::text, 'lead'::text]));

DROP POLICY IF EXISTS "Mission members can view compliance check results" ON public.compliance_check_results;
DROP POLICY IF EXISTS "Mission members can write compliance check results" ON public.compliance_check_results;
CREATE POLICY "Mission members can view compliance check results"
  ON public.compliance_check_results
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));
CREATE POLICY "Mission members can write compliance check results"
  ON public.compliance_check_results
  FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

-- 4) writer_identities: remove shared-mission arm, keep admin + self-only
DROP POLICY IF EXISTS "writer_identities_read_self_or_shared" ON public.writer_identities;
CREATE POLICY "writer_identities_read_self_or_admin"
  ON public.writer_identities
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.writer_identity_aliases a
      WHERE a.writer_id = writer_identities.id
        AND a.alias_kind = 'auth_user'
        AND a.alias_value = (auth.uid())::text
    )
  );
