
-- ============================================================
-- mission_strategic_signals (IRIS strategic intel per engagement)
-- ============================================================
CREATE TABLE public.mission_strategic_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  source_name text,
  source_url text,
  published_at timestamptz,
  title text NOT NULL,
  summary text,
  classification text NOT NULL DEFAULT 'signal',
  recommended_action text,
  affected_programs text[] DEFAULT '{}',
  affected_states text[] DEFAULT '{}',
  strategic_relevance numeric,
  urgency_score numeric,
  confidence_score numeric,
  status text NOT NULL DEFAULT 'open',
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, source_table, source_id)
);
CREATE INDEX ON public.mission_strategic_signals (engagement_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_strategic_signals TO authenticated;
GRANT ALL ON public.mission_strategic_signals TO service_role;

ALTER TABLE public.mission_strategic_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY mss_select_member ON public.mission_strategic_signals
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY mss_insert_leadership ON public.mission_strategic_signals
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY mss_update_leadership ON public.mission_strategic_signals
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY mss_delete_leadership ON public.mission_strategic_signals
  FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- ============================================================
-- pipeline_horizon (global IRIS feed across all missions)
-- ============================================================
CREATE TABLE public.pipeline_horizon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  source text,
  source_url text,
  source_type text,
  horizon_category text,
  published_at timestamptz,
  iris_type text,
  iris_headline text,
  iris_detail text,
  iris_action text,
  iris_processed_at timestamptz,
  strategic_relevance numeric,
  urgency_score numeric,
  confidence_score numeric,
  affected_states text[] DEFAULT '{}',
  affected_programs text[] DEFAULT '{}',
  affected_competitors text[] DEFAULT '{}',
  market_intelligence_id uuid,
  is_mission_specific boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.pipeline_horizon (status, ingested_at DESC);
CREATE INDEX ON public.pipeline_horizon (market_intelligence_id);

GRANT SELECT ON public.pipeline_horizon TO authenticated;
GRANT ALL ON public.pipeline_horizon TO service_role;

ALTER TABLE public.pipeline_horizon ENABLE ROW LEVEL SECURITY;
CREATE POLICY ph_select_authenticated ON public.pipeline_horizon
  FOR SELECT TO authenticated USING (true);

-- ============================================================
-- pipeline_horizon_missions (link horizon items to engagements)
-- ============================================================
CREATE TABLE public.pipeline_horizon_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  horizon_id uuid NOT NULL REFERENCES public.pipeline_horizon(id) ON DELETE CASCADE,
  engagement_id uuid NOT NULL,
  match_score numeric,
  match_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (horizon_id, engagement_id)
);
CREATE INDEX ON public.pipeline_horizon_missions (engagement_id);

GRANT SELECT ON public.pipeline_horizon_missions TO authenticated;
GRANT ALL ON public.pipeline_horizon_missions TO service_role;

ALTER TABLE public.pipeline_horizon_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY phm_select_member ON public.pipeline_horizon_missions
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

-- ============================================================
-- question_confidence_checks
-- ============================================================
CREATE TABLE public.question_confidence_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  reviewer text NOT NULL,
  health_status text NOT NULL,
  confidence_score integer NOT NULL,
  observations text,
  concerns text,
  recommendations text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.question_confidence_checks (engagement_id, question_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_confidence_checks TO authenticated;
GRANT ALL ON public.question_confidence_checks TO service_role;

ALTER TABLE public.question_confidence_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY qcc_select_member ON public.question_confidence_checks
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY qcc_insert_leadership ON public.question_confidence_checks
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- ============================================================
-- question_timeline (event log for a question)
-- ============================================================
CREATE TABLE public.question_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  event_type text NOT NULL,
  description text,
  actor text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.question_timeline (question_id, created_at DESC);

GRANT SELECT, INSERT ON public.question_timeline TO authenticated;
GRANT ALL ON public.question_timeline TO service_role;

ALTER TABLE public.question_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY qt_select_member ON public.question_timeline
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY qt_insert_member ON public.question_timeline
  FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id));

-- ============================================================
-- rfp_questions: add missing columns referenced by question-health
-- ============================================================
ALTER TABLE public.rfp_questions
  ADD COLUMN IF NOT EXISTS health text DEFAULT 'Green',
  ADD COLUMN IF NOT EXISTS health_score numeric,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Not Started',
  ADD COLUMN IF NOT EXISTS assigned_writer text,
  ADD COLUMN IF NOT EXISTS assigned_sme text,
  ADD COLUMN IF NOT EXISTS owner text,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS writer_confidence integer,
  ADD COLUMN IF NOT EXISTS sme_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_issues integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_review_score numeric;
