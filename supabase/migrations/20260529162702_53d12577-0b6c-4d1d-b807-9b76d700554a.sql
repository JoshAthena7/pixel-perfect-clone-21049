CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.is_engagement_member(_engagement_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE engagement_id = _engagement_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION private.has_engagement_role(_engagement_id UUID, _roles TEXT[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE engagement_id = _engagement_id AND user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

-- Re-point all policies to private.* helpers
-- engagements
DROP POLICY IF EXISTS "engagements_select_member" ON public.engagements;
DROP POLICY IF EXISTS "engagements_update_leadership" ON public.engagements;
DROP POLICY IF EXISTS "engagements_delete_founder" ON public.engagements;
CREATE POLICY "engagements_select_member" ON public.engagements FOR SELECT TO authenticated USING (private.is_engagement_member(id));
CREATE POLICY "engagements_update_leadership" ON public.engagements FOR UPDATE TO authenticated USING (private.has_engagement_role(id, ARRAY['founder','pm']));
CREATE POLICY "engagements_delete_founder" ON public.engagements FOR DELETE TO authenticated USING (private.has_engagement_role(id, ARRAY['founder']));

-- engagement_members
DROP POLICY IF EXISTS "members_select_self_engagement" ON public.engagement_members;
DROP POLICY IF EXISTS "members_insert_leadership" ON public.engagement_members;
DROP POLICY IF EXISTS "members_update_leadership" ON public.engagement_members;
DROP POLICY IF EXISTS "members_delete_leadership" ON public.engagement_members;
CREATE POLICY "members_select_self_engagement" ON public.engagement_members FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members_insert_leadership" ON public.engagement_members FOR INSERT TO authenticated
  WITH CHECK (
    private.has_engagement_role(engagement_id, ARRAY['founder','pm'])
    OR NOT EXISTS (SELECT 1 FROM public.engagement_members em WHERE em.engagement_id = engagement_members.engagement_id)
  );
CREATE POLICY "members_update_leadership" ON public.engagement_members FOR UPDATE TO authenticated USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm']));
CREATE POLICY "members_delete_leadership" ON public.engagement_members FOR DELETE TO authenticated USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm']));

-- huddles
DROP POLICY IF EXISTS "huddles_select_member" ON public.huddles;
DROP POLICY IF EXISTS "huddles_insert_member" ON public.huddles;
CREATE POLICY "huddles_select_member" ON public.huddles FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "huddles_insert_member" ON public.huddles FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id) AND submitted_by = auth.uid());

-- sos
DROP POLICY IF EXISTS "sos_select_member" ON public.sos_alerts;
DROP POLICY IF EXISTS "sos_insert_member" ON public.sos_alerts;
DROP POLICY IF EXISTS "sos_update_leadership" ON public.sos_alerts;
CREATE POLICY "sos_select_member" ON public.sos_alerts FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "sos_insert_member" ON public.sos_alerts FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id) AND submitted_by = auth.uid());
CREATE POLICY "sos_update_leadership" ON public.sos_alerts FOR UPDATE TO authenticated USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- risks
DROP POLICY IF EXISTS "risks_select_member" ON public.risks;
DROP POLICY IF EXISTS "risks_write_leadership" ON public.risks;
DROP POLICY IF EXISTS "risks_update_leadership" ON public.risks;
CREATE POLICY "risks_select_member" ON public.risks FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "risks_write_leadership" ON public.risks FOR INSERT TO authenticated WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY "risks_update_leadership" ON public.risks FOR UPDATE TO authenticated USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- heatmap
DROP POLICY IF EXISTS "heatmap_select_member" ON public.heatmap_sections;
DROP POLICY IF EXISTS "heatmap_update_leadership" ON public.heatmap_sections;
CREATE POLICY "heatmap_select_member" ON public.heatmap_sections FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "heatmap_update_leadership" ON public.heatmap_sections FOR UPDATE TO authenticated USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- intel
DROP POLICY IF EXISTS "intel_select_member" ON public.intel_documents;
DROP POLICY IF EXISTS "intel_insert_member" ON public.intel_documents;
CREATE POLICY "intel_select_member" ON public.intel_documents FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "intel_insert_member" ON public.intel_documents FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id));

-- decisions
DROP POLICY IF EXISTS "decisions_select_member" ON public.decisions;
DROP POLICY IF EXISTS "decisions_write_leadership" ON public.decisions;
CREATE POLICY "decisions_select_member" ON public.decisions FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "decisions_write_leadership" ON public.decisions FOR INSERT TO authenticated WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- pulses
DROP POLICY IF EXISTS "pulses_select_member" ON public.client_pulses;
DROP POLICY IF EXISTS "pulses_write_leadership" ON public.client_pulses;
CREATE POLICY "pulses_select_member" ON public.client_pulses FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "pulses_write_leadership" ON public.client_pulses FOR INSERT TO authenticated WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- broadcasts
DROP POLICY IF EXISTS "broadcasts_select_member" ON public.broadcasts;
DROP POLICY IF EXISTS "broadcasts_insert_leadership" ON public.broadcasts;
DROP POLICY IF EXISTS "broadcasts_update_leadership" ON public.broadcasts;
CREATE POLICY "broadcasts_select_member" ON public.broadcasts FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "broadcasts_insert_leadership" ON public.broadcasts FOR INSERT TO authenticated WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']) AND author_id = auth.uid());
CREATE POLICY "broadcasts_update_leadership" ON public.broadcasts FOR UPDATE TO authenticated USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- storage
DROP POLICY IF EXISTS "intel_files_member_read" ON storage.objects;
DROP POLICY IF EXISTS "intel_files_member_write" ON storage.objects;
CREATE POLICY "intel_files_member_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'intel-files' AND private.is_engagement_member((storage.foldername(name))[1]::uuid));
CREATE POLICY "intel_files_member_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'intel-files' AND private.is_engagement_member((storage.foldername(name))[1]::uuid));

-- Drop the now-unused public helpers
DROP FUNCTION IF EXISTS public.is_engagement_member(UUID);
DROP FUNCTION IF EXISTS public.has_engagement_role(UUID, TEXT[]);