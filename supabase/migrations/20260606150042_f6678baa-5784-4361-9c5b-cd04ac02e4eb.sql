
DROP POLICY IF EXISTS "Mission PMs can manage templates" ON public.mission_response_templates;
CREATE POLICY "Mission PMs can manage templates"
  ON public.mission_response_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_response_templates.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('project_manager','engagement_lead','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_response_templates.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('project_manager','engagement_lead','admin')));

DROP POLICY IF EXISTS "Mission PMs can manage template elements" ON public.mission_response_template_elements;
CREATE POLICY "Mission PMs can manage template elements"
  ON public.mission_response_template_elements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_response_templates t JOIN public.mission_members mm ON mm.mission_id = t.mission_id WHERE t.id = mission_response_template_elements.template_id AND mm.user_id = auth.uid() AND mm.role IN ('project_manager','engagement_lead','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_response_templates t JOIN public.mission_members mm ON mm.mission_id = t.mission_id WHERE t.id = mission_response_template_elements.template_id AND mm.user_id = auth.uid() AND mm.role IN ('project_manager','engagement_lead','admin')));

DROP POLICY IF EXISTS "Mission PMs can insert template versions" ON public.mission_response_template_versions;
CREATE POLICY "Mission PMs can insert template versions"
  ON public.mission_response_template_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_response_templates t JOIN public.mission_members mm ON mm.mission_id = t.mission_id WHERE t.id = mission_response_template_versions.template_id AND mm.user_id = auth.uid() AND mm.role IN ('project_manager','engagement_lead','admin')));
