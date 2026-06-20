
-- =====================================================================
-- ATLAS Learning Architecture — Phase A foundations
-- =====================================================================

-- 1. Ensure pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Embedding columns on existing tables
ALTER TABLE public.oracle_signals
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE public.oracle_knowledge_base
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_oracle_signals_embedding
  ON public.oracle_signals USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_oracle_kb_embedding
  ON public.oracle_knowledge_base USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- 3. oracle_source_registry quality columns
ALTER TABLE public.oracle_source_registry
  ADD COLUMN IF NOT EXISTS approval_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dismissal_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_signals_generated integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_relevance_score float DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quality_score float DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS last_quality_update timestamptz DEFAULT now();

-- =====================================================================
-- 4. oracle_signal_feedback
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.oracle_signal_feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  oracle_signal_id uuid REFERENCES public.oracle_signals(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE SET NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN (
    'approved','pushed','dismissed','brief_used','brief_ignored',
    'high_score_correlation','low_score_correlation','human_validated',
    'exported','confidence_high','confidence_low'
  )),
  weight float NOT NULL CHECK (weight BETWEEN -1.0 AND 1.0),
  source_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.oracle_signal_feedback TO authenticated;
GRANT ALL ON public.oracle_signal_feedback TO service_role;

ALTER TABLE public.oracle_signal_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mission members can read feedback" ON public.oracle_signal_feedback;
CREATE POLICY "Mission members can read feedback"
  ON public.oracle_signal_feedback
  FOR SELECT
  USING (mission_id IS NULL OR public.is_mission_team_member(mission_id, auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert feedback" ON public.oracle_signal_feedback;
CREATE POLICY "Authenticated can insert feedback"
  ON public.oracle_signal_feedback
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_feedback_signal ON public.oracle_signal_feedback(oracle_signal_id);
CREATE INDEX IF NOT EXISTS idx_feedback_mission ON public.oracle_signal_feedback(mission_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON public.oracle_signal_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.oracle_signal_feedback(created_at DESC);

-- =====================================================================
-- 5. atlas_institutional_memory
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.atlas_institutional_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type text NOT NULL CHECK (pattern_type IN (
    'scoring_correlation','evaluator_signal','win_theme_performance',
    'section_strategy','competitor_weakness','state_preference',
    'source_quality','brief_effectiveness'
  )),
  pattern_description text NOT NULL,
  supporting_evidence jsonb DEFAULT '[]'::jsonb,
  applicable_states text[] DEFAULT '{}',
  applicable_procurement_types text[] DEFAULT '{}',
  applicable_question_categories text[] DEFAULT '{}',
  applicable_win_theme_ids uuid[] DEFAULT '{}',
  times_applied integer DEFAULT 0,
  times_confirmed integer DEFAULT 0,
  times_rejected integer DEFAULT 0,
  confidence_score float DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  extracted_from_mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  extraction_method text CHECK (extraction_method IN (
    'mission_close','human_validated','pattern_detected','score_correlation'
  )),
  human_validated boolean DEFAULT false,
  validated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  embedding vector(1536),
  first_observed_at timestamptz DEFAULT now(),
  last_confirmed_at timestamptz DEFAULT now(),
  suppressed boolean DEFAULT false,
  suppression_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.atlas_institutional_memory TO authenticated;
GRANT ALL ON public.atlas_institutional_memory TO service_role;

ALTER TABLE public.atlas_institutional_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage institutional memory" ON public.atlas_institutional_memory;
CREATE POLICY "Admins manage institutional memory"
  ON public.atlas_institutional_memory
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Authenticated can read memory" ON public.atlas_institutional_memory;
CREATE POLICY "Authenticated can read memory"
  ON public.atlas_institutional_memory
  FOR SELECT
  USING (auth.role() = 'authenticated' AND NOT suppressed);

CREATE INDEX IF NOT EXISTS idx_memory_type ON public.atlas_institutional_memory(pattern_type);
CREATE INDEX IF NOT EXISTS idx_memory_states ON public.atlas_institutional_memory USING GIN (applicable_states);
CREATE INDEX IF NOT EXISTS idx_memory_embedding
  ON public.atlas_institutional_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_atlas_memory_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atlas_memory_updated ON public.atlas_institutional_memory;
CREATE TRIGGER trg_atlas_memory_updated
  BEFORE UPDATE ON public.atlas_institutional_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_atlas_memory_updated_at();

-- =====================================================================
-- 6. atlas_entity_relationships
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.atlas_entity_relationships (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_entity_type text NOT NULL CHECK (source_entity_type IN (
    'state','agency','stakeholder','competitor','program','regulation',
    'oracle_signal','win_theme','pursuit','procurement_type'
  )),
  source_entity_id text NOT NULL,
  source_entity_name text NOT NULL,
  relationship_type text NOT NULL CHECK (relationship_type IN (
    'oversees','funds','competes_with','authored','governs','influences',
    'contradicts','supports','cites','implements','monitors','reports_to',
    'partners_with','opposes'
  )),
  relationship_strength float DEFAULT 0.5 CHECK (relationship_strength BETWEEN 0 AND 1),
  relationship_notes text,
  target_entity_type text NOT NULL,
  target_entity_id text NOT NULL,
  target_entity_name text NOT NULL,
  evidence_count integer DEFAULT 1,
  source_oracle_signal_ids uuid[] DEFAULT '{}',
  state_code text,
  first_observed_at timestamptz DEFAULT now(),
  last_updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE(source_entity_type, source_entity_id, relationship_type, target_entity_type, target_entity_id)
);

GRANT SELECT ON public.atlas_entity_relationships TO authenticated;
GRANT ALL ON public.atlas_entity_relationships TO service_role;

ALTER TABLE public.atlas_entity_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read relationships" ON public.atlas_entity_relationships;
CREATE POLICY "Authenticated can read relationships"
  ON public.atlas_entity_relationships
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage relationships" ON public.atlas_entity_relationships;
CREATE POLICY "Admins can manage relationships"
  ON public.atlas_entity_relationships
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_relationships_source
  ON public.atlas_entity_relationships(source_entity_type, source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target
  ON public.atlas_entity_relationships(target_entity_type, target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_state
  ON public.atlas_entity_relationships(state_code);

-- =====================================================================
-- 7. RPCs
-- =====================================================================

CREATE OR REPLACE FUNCTION public.hybrid_oracle_search(
  p_mission_id uuid,
  p_query_text text,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_limit int DEFAULT 15,
  p_include_tiers text[] DEFAULT ARRAY['platform','state','mission']
)
RETURNS TABLE(
  id uuid,
  title text,
  what_happened text,
  why_it_matters text,
  recommended_action text,
  category text,
  tier text,
  urgency text,
  relevance_score integer,
  source_name text,
  topic_tags text[],
  win_theme_tags text[],
  similarity_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_code text;
BEGIN
  SELECT state_code INTO v_state_code
  FROM public.missions WHERE id = p_mission_id;

  RETURN QUERY
  SELECT
    os.id,
    os.title,
    os.what_happened,
    os.why_it_matters,
    os.recommended_action,
    os.category,
    os.tier,
    os.urgency,
    os.relevance_score,
    os.source_name,
    os.topic_tags,
    os.win_theme_tags,
    CASE
      WHEN p_query_embedding IS NOT NULL AND os.embedding IS NOT NULL THEN
        (0.60 * (1 - (os.embedding <=> p_query_embedding))) +
        (0.25 * COALESCE(
          ts_rank(
            to_tsvector('english', COALESCE(os.title,'') || ' ' || COALESCE(os.what_happened,'') || ' ' || COALESCE(os.why_it_matters,'')),
            plainto_tsquery('english', p_query_text)
          ), 0
        )) +
        (0.15 * (COALESCE(os.relevance_score,0)::float / 100))
      ELSE
        (0.70 * COALESCE(
          ts_rank(
            to_tsvector('english', COALESCE(os.title,'') || ' ' || COALESCE(os.what_happened,'') || ' ' || COALESCE(os.why_it_matters,'')),
            plainto_tsquery('english', p_query_text)
          ), 0
        )) +
        (0.30 * (COALESCE(os.relevance_score,0)::float / 100))
    END::float AS similarity_score
  FROM public.oracle_signals os
  WHERE
    os.status IN ('approved','pushed')
    AND os.tier = ANY(p_include_tiers)
    AND (
      (os.tier = 'mission' AND os.mission_id = p_mission_id)
      OR (os.tier = 'state' AND os.state_code = v_state_code)
      OR (os.tier = 'platform')
    )
  ORDER BY similarity_score DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_oracle_search(uuid, text, vector, int, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.keyword_oracle_search(
  p_mission_id uuid,
  p_query_text text,
  p_limit int DEFAULT 15
)
RETURNS TABLE(
  id uuid, title text, what_happened text, why_it_matters text,
  recommended_action text, category text, tier text, urgency text,
  relevance_score integer, source_name text, topic_tags text[],
  win_theme_tags text[], similarity_score float
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.hybrid_oracle_search(p_mission_id, p_query_text, NULL, p_limit);
$$;

GRANT EXECUTE ON FUNCTION public.keyword_oracle_search(uuid, text, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_signals_needing_embeddings(p_limit int DEFAULT 50)
RETURNS TABLE(
  id uuid, title text, what_happened text, why_it_matters text,
  category text, topic_tags text[]
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, title, what_happened, why_it_matters, category, topic_tags
  FROM public.oracle_signals
  WHERE embedding IS NULL
    AND status IN ('approved','pushed','needs_review')
  ORDER BY created_at DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_signals_needing_embeddings(int) TO authenticated, service_role;

-- =====================================================================
-- 8. Source-performance update RPCs
-- =====================================================================
CREATE OR REPLACE FUNCTION public.increment_source_approvals(p_source_name text)
RETURNS void
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.oracle_source_registry
  SET
    approval_count = COALESCE(approval_count,0) + 1,
    quality_score = LEAST(1.0,
      (COALESCE(approval_count,0) + 1)::float
      / GREATEST(1, COALESCE(approval_count,0) + COALESCE(dismissal_count,0) + 1)
    ),
    last_quality_update = now()
  WHERE source_name = p_source_name;
$$;

CREATE OR REPLACE FUNCTION public.increment_source_dismissals(p_source_name text)
RETURNS void
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.oracle_source_registry
  SET
    dismissal_count = COALESCE(dismissal_count,0) + 1,
    quality_score = GREATEST(0.0,
      COALESCE(approval_count,0)::float
      / GREATEST(1, COALESCE(approval_count,0) + COALESCE(dismissal_count,0) + 1)
    ),
    last_quality_update = now()
  WHERE source_name = p_source_name;
$$;

GRANT EXECUTE ON FUNCTION public.increment_source_approvals(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_source_dismissals(text) TO authenticated, service_role;

-- =====================================================================
-- 9. Nightly feedback → relevance update job
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_signal_relevance_from_feedback()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signal_record RECORD;
  feedback_delta float;
  new_score integer;
BEGIN
  FOR signal_record IN
    SELECT
      osf.oracle_signal_id,
      SUM(osf.weight) AS total_weight,
      COUNT(*)        AS feedback_count
    FROM public.oracle_signal_feedback osf
    WHERE osf.created_at > now() - interval '25 hours'
      AND osf.oracle_signal_id IS NOT NULL
    GROUP BY osf.oracle_signal_id
    HAVING COUNT(*) > 0
  LOOP
    feedback_delta := GREATEST(-5, LEAST(5, signal_record.total_weight * 10));

    SELECT GREATEST(0, LEAST(100, COALESCE(relevance_score,0) + feedback_delta::integer))
      INTO new_score
      FROM public.oracle_signals
     WHERE id = signal_record.oracle_signal_id;

    UPDATE public.oracle_signals
       SET relevance_score = new_score,
           updated_at = now()
     WHERE id = signal_record.oracle_signal_id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_signal_relevance_from_feedback() TO service_role;

-- Schedule nightly (idempotent — unschedule existing first)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signal-relevance-update') THEN
    PERFORM cron.unschedule('signal-relevance-update');
  END IF;
  PERFORM cron.schedule(
    'signal-relevance-update',
    '0 3 * * *',
    $cron$SELECT public.update_signal_relevance_from_feedback();$cron$
  );
END $$;
