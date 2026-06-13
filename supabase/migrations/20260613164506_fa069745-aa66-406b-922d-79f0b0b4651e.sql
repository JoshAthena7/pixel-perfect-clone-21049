-- Canonical intelligence taxonomy documentation

COMMENT ON TABLE public.signals IS
'SIGNAL: Real-time intelligence observation associated with a specific mission. Ephemeral. Logged frequently. Does not change mission strategy. Use for: things the team learned today, news, SME observations, contact intel. NOT for: strategic direction changes (use missions canvas), persistent lessons (use insights).';

COMMENT ON TABLE public.insights IS
'INSIGHT: Strategic observation with value beyond a single mission interaction. Persistent. Mission-specific (mission_id set) or global (mission_id null). insight_type taxonomy: win_pattern = something that consistently improves scoring or win probability; loss_lesson = something that consistently hurts scoring or causes losses; competitive_intel = intelligence about specific competitors; lesson = post-hoc learning from question or mission closeout; observation = general strategic observation that doesn''t fit above categories. Global insights (mission_id null) are the Athena intelligence library. Mission insights (mission_id set) are specific to one pursuit.';

COMMENT ON COLUMN public.insights.insight_type IS
'Insight taxonomy: win_pattern | loss_lesson | competitive_intel | lesson | observation. See table comment for full definitions.';

COMMENT ON COLUMN public.insights.mission_id IS
'NULL = global Athena-library insight (applies across pursuits). Set = mission-specific insight.';

-- Mission canvas fields (human-entered strategic inputs consumed by IRIS)
DO $$
DECLARE
  canvas_doc text := 'CANVAS: Human-entered strategic input for this mission. This is the mission owner''s strategic direction — not IRIS output. IRIS reads canvas fields as highest-priority context for brief generation. Becomes read-only when missions.brief_status = ''approved''.';
  col text;
BEGIN
  FOREACH col IN ARRAY ARRAY[
    'north_star',
    'why_win',
    'why_lose',
    'state_priorities',
    'competitive_context',
    'proposal_guidance',
    'stakeholder_intelligence',
    'executive_intelligence'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = col
    ) THEN
      EXECUTE format('COMMENT ON COLUMN public.missions.%I IS %L', col, canvas_doc);
    END IF;
  END LOOP;
END $$;

COMMENT ON COLUMN public.missions.brief_status IS
'Lifecycle of the mission brief. When set to ''approved'', the canvas fields (north_star, why_win, why_lose, state_priorities, competitive_context, proposal_guidance, stakeholder_intelligence, executive_intelligence) become read-only.';