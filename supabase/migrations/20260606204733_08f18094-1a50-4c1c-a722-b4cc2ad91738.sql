CREATE OR REPLACE FUNCTION public.developer_reset_all_mission_data(p_caller uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := p_caller;
  v_is_admin boolean;
  v_table text;
  v_count bigint;
  v_total bigint := 0;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_tables text[] := ARRAY[
    'question_intelligence_matches','question_intelligence','question_relationships',
    'question_collaboration','question_pulses','question_scores','question_gate_status',
    'alignment_conflicts','mock_scores','score_me_history','score_me_interactions',
    'compliance_check_results','compliance_requirements','reality_updates',
    'research_results','research_tasks','iris_corrections','iris_health_flags',
    'iris_staffing_recommendations','pilot_copilot_messages','client_clarifications',
    'mission_conflict_ack','amendment_changes','rfp_amendments',
    'comment_resolutions','comments','mentions','note_reads',
    'signals','checkin_section_updates','checkin_submissions','checkin_tokens',
    'checkin_cycles','threads',
    'mission_intelligence_dna','mission_intelligence_scores','mission_expertise_signals',
    'mission_member_expertise','mission_client_intel','mission_monitoring_sources',
    'mission_evaluation_criteria','mission_sensitivities','mission_assumptions',
    'mission_outcomes','mission_debriefs','mission_decisions','mission_review_gates',
    'mission_risks','mission_strategy','mission_timeline','mission_governance',
    'mission_financials','mission_volumes','mission_library','mission_vault_documents',
    'mission_response_template_elements','mission_response_template_versions',
    'mission_response_templates','win_themes','executive_decisions','contributions',
    'document_extractions','market_intelligence','broadcasts','canon_suggestions',
    'support_responses','support_requests',
    'briefing_acknowledgments','briefing_book_section_history','briefing_book_sections',
    'briefings','iris_brief_cache','iris_memory_usage','iris_memories',
    'atlas_knowledge_objects','atlas_sources',
    'graph_edges','graph_nodes','embeddings',
    'mission_sections','question_records','mission_members',
    'missions'
  ];
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller AND role = 'admin'::public.app_role
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only platform admins can run the developer reset';
  END IF;

  FOREACH v_table IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I', v_table);
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_total := v_total + v_count;
      v_results := v_results || jsonb_build_object('table', v_table, 'deleted', v_count);
    EXCEPTION WHEN undefined_table THEN
      v_results := v_results || jsonb_build_object('table', v_table, 'skipped', 'missing');
    WHEN OTHERS THEN
      v_results := v_results || jsonb_build_object('table', v_table, 'error', SQLERRM);
      v_errors := v_errors || jsonb_build_object('table', v_table, 'error', SQLERRM);
    END;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RAISE EXCEPTION 'Developer reset failed on one or more tables: %', v_errors::text;
  END IF;

  BEGIN
    INSERT INTO public.olympus_audit_log(user_id, action_type, action_summary, metadata)
    VALUES (
      v_caller,
      'developer.reset_all_mission_data',
      format('Developer reset wiped %s rows', v_total),
      jsonb_build_object('total_deleted', v_total, 'results', v_results)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'total_deleted', v_total, 'results', v_results);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.developer_reset_all_mission_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.developer_reset_all_mission_data(uuid) TO service_role;