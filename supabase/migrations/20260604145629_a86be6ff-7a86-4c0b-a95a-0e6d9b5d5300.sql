DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'missions','mission_members','mission_assumptions','mission_decisions',
    'mission_risks','mission_library','mission_outcomes','mission_review_gates',
    'mission_vault_documents','mission_intelligence_dna','mission_intelligence_scores',
    'question_records','question_scores','question_pulses','question_intelligence',
    'question_collaboration','question_relationships','question_gate_status',
    'question_intelligence_matches','alignment_conflicts','win_themes',
    'compliance_requirements','compliance_check_results','briefing_book_sections',
    'briefing_book_section_history','iris_corrections','iris_memories',
    'iris_health_flags','iris_brief_cache','rfp_amendments','amendment_changes',
    'signals','reality_updates','contributions','support_requests',
    'support_responses','broadcasts','mock_scores','score_me_history',
    'atlas_knowledge_objects','atlas_lessons_learned','atlas_playbook_chapters',
    'atlas_programs','atlas_sources','atlas_source_citations',
    'atlas_source_definitions','atlas_source_requirements',
    'atlas_source_question_links','atlas_entities','atlas_states',
    'intelligence_canon','program_intelligence','state_intelligence',
    'collective_memory','mission_intelligence_dna','research_tasks',
    'research_results','escalations','document_extractions',
    'pilot_copilot_messages','app_support_settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS beta_admin_only_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS beta_admin_only_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS beta_admin_only_delete ON public.%I', t);

    EXECUTE format($f$
      CREATE POLICY beta_admin_only_insert ON public.%I
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY beta_admin_only_update ON public.%I
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (public.has_role(auth.uid(), 'admin'::public.app_role))
        WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY beta_admin_only_delete ON public.%I
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING (public.has_role(auth.uid(), 'admin'::public.app_role))
    $f$, t);
  END LOOP;
END $$;