
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- EMBEDDINGS
-- ============================================================
CREATE TABLE public.embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid REFERENCES public.engagements(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  content_text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_table, source_id)
);
CREATE INDEX idx_embeddings_engagement ON public.embeddings(engagement_id);
CREATE INDEX idx_embeddings_source ON public.embeddings(source_table, source_id);
CREATE INDEX idx_embeddings_vector ON public.embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

GRANT SELECT ON public.embeddings TO authenticated;
GRANT ALL ON public.embeddings TO service_role;
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY embeddings_select_member ON public.embeddings
  FOR SELECT TO authenticated
  USING (engagement_id IS NULL OR private.is_engagement_member(engagement_id));
CREATE POLICY embeddings_service_all ON public.embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- INTELLIGENCE INSIGHTS
-- ============================================================
CREATE TABLE public.intelligence_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid REFERENCES public.engagements(id) ON DELETE CASCADE,
  insight_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  confidence_score numeric NOT NULL DEFAULT 0.5,
  supporting_data jsonb,
  actioned boolean NOT NULL DEFAULT false,
  actioned_by uuid,
  actioned_at timestamptz,
  confirmed_predictive boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT severity_check CHECK (severity IN ('info','warning','critical')),
  CONSTRAINT insight_type_check CHECK (insight_type IN (
    'trajectory_warning','section_risk','systemic_issue',
    'client_risk','below_win_curve','external_signal',
    'team_pattern','competitor_signal','regulatory_change',
    'content_pattern','capacity_warning'
  ))
);
CREATE INDEX idx_insights_engagement ON public.intelligence_insights(engagement_id, actioned, created_at DESC);
CREATE INDEX idx_insights_type ON public.intelligence_insights(insight_type, confirmed_predictive);

GRANT SELECT, UPDATE ON public.intelligence_insights TO authenticated;
GRANT ALL ON public.intelligence_insights TO service_role;
ALTER TABLE public.intelligence_insights ENABLE ROW LEVEL SECURITY;

-- Engagement members see their engagement's insights; founders/PMs also see firm-wide (null engagement_id) insights.
CREATE POLICY insights_select_member ON public.intelligence_insights
  FOR SELECT TO authenticated
  USING (
    (engagement_id IS NOT NULL AND private.is_engagement_member(engagement_id))
    OR (engagement_id IS NULL AND EXISTS (
      SELECT 1 FROM public.engagement_members em
      WHERE em.user_id = auth.uid()
        AND em.role IN ('founder','pm')
    ))
  );
CREATE POLICY insights_update_member ON public.intelligence_insights
  FOR UPDATE TO authenticated
  USING (
    (engagement_id IS NOT NULL AND private.is_engagement_member(engagement_id))
    OR (engagement_id IS NULL AND EXISTS (
      SELECT 1 FROM public.engagement_members em
      WHERE em.user_id = auth.uid()
        AND em.role IN ('founder','pm')
    ))
  );
CREATE POLICY insights_service_all ON public.intelligence_insights
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- MARKET INTELLIGENCE
-- ============================================================
CREATE TABLE public.market_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  title text NOT NULL,
  summary text,
  url text,
  relevant_states text[] DEFAULT '{}',
  relevant_categories text[] DEFAULT '{}',
  raw_data jsonb,
  embedding vector(1536),
  published_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_intel_states ON public.market_intelligence USING gin(relevant_states);
CREATE INDEX idx_market_intel_ingested ON public.market_intelligence(ingested_at DESC);
CREATE INDEX idx_market_intel_vector ON public.market_intelligence
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

GRANT SELECT ON public.market_intelligence TO authenticated;
GRANT ALL ON public.market_intelligence TO service_role;
ALTER TABLE public.market_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_intel_select_leadership ON public.market_intelligence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE user_id = auth.uid()
      AND role IN ('founder','pm','engagement_lead')
  ));
CREATE POLICY market_intel_service_all ON public.market_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- INSIGHT TYPE WEIGHTS
-- ============================================================
CREATE TABLE public.insight_type_weights (
  insight_type text PRIMARY KEY,
  base_confidence numeric NOT NULL DEFAULT 0.5,
  confirmed_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  accuracy_rate numeric GENERATED ALWAYS AS (
    CASE WHEN total_count = 0 THEN 0.5
    ELSE confirmed_count::numeric / total_count END
  ) STORED,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.insight_type_weights (insight_type, base_confidence) VALUES
  ('trajectory_warning', 0.7),
  ('section_risk', 0.65),
  ('systemic_issue', 0.8),
  ('client_risk', 0.75),
  ('below_win_curve', 0.7),
  ('external_signal', 0.6),
  ('team_pattern', 0.6),
  ('competitor_signal', 0.65),
  ('regulatory_change', 0.85),
  ('content_pattern', 0.55),
  ('capacity_warning', 0.7);

GRANT SELECT ON public.insight_type_weights TO authenticated;
GRANT ALL ON public.insight_type_weights TO service_role;
ALTER TABLE public.insight_type_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY weights_select_all ON public.insight_type_weights
  FOR SELECT TO authenticated USING (true);
CREATE POLICY weights_service_all ON public.insight_type_weights
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- EMBEDDING QUEUE
-- ============================================================
CREATE TABLE public.embedding_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  engagement_id uuid,
  content_text text NOT NULL,
  priority integer NOT NULL DEFAULT 5,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  queued_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(source_table, source_id)
);
CREATE INDEX idx_embed_queue_unprocessed ON public.embedding_queue(priority DESC, queued_at)
  WHERE processed_at IS NULL;

GRANT ALL ON public.embedding_queue TO service_role;
ALTER TABLE public.embedding_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY queue_service_all ON public.embedding_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- ENGAGEMENT OUTCOMES (Phase F needs this)
-- ============================================================
CREATE TABLE public.engagement_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL UNIQUE REFERENCES public.engagements(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  awardee text,
  award_amount numeric,
  decision_date date,
  notes text,
  recorded_by uuid,
  recorder_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outcome_check CHECK (outcome IN ('Won','Lost','No-Bid','Withdrawn','Pending'))
);
CREATE INDEX idx_outcomes_engagement ON public.engagement_outcomes(engagement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_outcomes TO authenticated;
GRANT ALL ON public.engagement_outcomes TO service_role;
ALTER TABLE public.engagement_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY outcomes_select_member ON public.engagement_outcomes
  FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY outcomes_write_leadership ON public.engagement_outcomes
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm']));
CREATE POLICY outcomes_update_leadership ON public.engagement_outcomes
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm']));
CREATE POLICY outcomes_service_all ON public.engagement_outcomes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- ENGAGEMENT POSTMORTEMS
-- ============================================================
CREATE TABLE public.engagement_postmortems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  outcome text NOT NULL,
  summary text NOT NULL,
  lessons_learned jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_postmortems_engagement ON public.engagement_postmortems(engagement_id);

GRANT SELECT ON public.engagement_postmortems TO authenticated;
GRANT ALL ON public.engagement_postmortems TO service_role;
ALTER TABLE public.engagement_postmortems ENABLE ROW LEVEL SECURITY;
CREATE POLICY postmortems_select_leadership ON public.engagement_postmortems
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY postmortems_service_all ON public.engagement_postmortems
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- CONTENT LIBRARY
-- ============================================================
CREATE TABLE public.content_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'Lesson Learned',
  source_engagement_id uuid REFERENCES public.engagements(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_library_tags ON public.content_library USING gin(tags);
CREATE INDEX idx_content_library_category ON public.content_library(category);

GRANT SELECT ON public.content_library TO authenticated;
GRANT ALL ON public.content_library TO service_role;
ALTER TABLE public.content_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_library_select_leadership ON public.content_library
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE user_id = auth.uid()
      AND role IN ('founder','pm','engagement_lead')
  ));
CREATE POLICY content_library_service_all ON public.content_library
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- MONITORING TARGETS (Phase G4)
-- ============================================================
CREATE TABLE public.monitoring_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  value text NOT NULL,
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT target_type_check CHECK (target_type IN ('competitor','state','keyword')),
  UNIQUE(target_type, value)
);

GRANT SELECT, INSERT, DELETE ON public.monitoring_targets TO authenticated;
GRANT ALL ON public.monitoring_targets TO service_role;
ALTER TABLE public.monitoring_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY monitoring_select_leadership ON public.monitoring_targets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE user_id = auth.uid()
      AND role IN ('founder','pm')
  ));
CREATE POLICY monitoring_insert_leadership ON public.monitoring_targets
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE user_id = auth.uid()
      AND role IN ('founder','pm')
  ) AND created_by = auth.uid());
CREATE POLICY monitoring_delete_leadership ON public.monitoring_targets
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE user_id = auth.uid()
      AND role IN ('founder','pm')
  ));

-- ============================================================
-- TRIGGER: enqueue_for_embedding
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_for_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  content_val text;
  eng_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'heatmap_sections' THEN
    content_val := COALESCE(NEW.section_name,'') || ' ' ||
                   COALESCE(NEW.notes,'') || ' ' ||
                   COALESCE(NEW.instructions,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'decisions' THEN
    content_val := COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.rationale,'') || ' ' ||
                   COALESCE(NEW.impacted_areas,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'huddles' THEN
    content_val := COALESCE(NEW.priority,'') || ' ' ||
                   COALESCE(NEW.risk,'') || ' ' ||
                   COALESCE(NEW.notes,'') || ' ' ||
                   COALESCE(NEW.writer_concern,'') || ' ' ||
                   COALESCE(NEW.client_concern,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'sos_alerts' THEN
    content_val := COALESCE(NEW.category,'') || ' ' ||
                   COALESCE(NEW.description,'') || ' ' ||
                   COALESCE(NEW.recommended_action,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'intel_documents' THEN
    content_val := COALESCE(NEW.name,'') || ' ' ||
                   COALESCE(NEW.category,'') || ' ' ||
                   COALESCE(NEW.notes,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'win_themes' THEN
    content_val := COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.description,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'risks' THEN
    content_val := COALESCE(NEW.title,'') || ' ' ||
                   COALESCE(NEW.description,'');
    eng_id := NEW.engagement_id;
  ELSIF TG_TABLE_NAME = 'client_pulses' THEN
    content_val := COALESCE(NEW.sentiment,'') || ' ' ||
                   COALESCE(NEW.summary,'') || ' ' ||
                   COALESCE(NEW.action_items,'');
    eng_id := NEW.engagement_id;
  END IF;

  IF content_val IS NOT NULL AND trim(content_val) <> '' THEN
    INSERT INTO public.embedding_queue
      (source_table, source_id, engagement_id, content_text, priority)
    VALUES
      (TG_TABLE_NAME, NEW.id, eng_id, trim(content_val), 5)
    ON CONFLICT (source_table, source_id)
    DO UPDATE SET
      content_text = EXCLUDED.content_text,
      processed_at = NULL,
      attempts = 0,
      queued_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER embed_heatmap_sections  AFTER INSERT OR UPDATE ON public.heatmap_sections  FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();
CREATE TRIGGER embed_decisions         AFTER INSERT OR UPDATE ON public.decisions         FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();
CREATE TRIGGER embed_huddles           AFTER INSERT OR UPDATE ON public.huddles           FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();
CREATE TRIGGER embed_sos_alerts        AFTER INSERT OR UPDATE ON public.sos_alerts        FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();
CREATE TRIGGER embed_intel_documents   AFTER INSERT OR UPDATE ON public.intel_documents   FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();
CREATE TRIGGER embed_win_themes        AFTER INSERT OR UPDATE ON public.win_themes        FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();
CREATE TRIGGER embed_risks             AFTER INSERT OR UPDATE ON public.risks             FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();
CREATE TRIGGER embed_client_pulses     AFTER INSERT OR UPDATE ON public.client_pulses     FOR EACH ROW EXECUTE FUNCTION public.enqueue_for_embedding();

-- ============================================================
-- SEMANTIC SEARCH RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_similar_content(
  query_embedding vector(1536),
  match_engagement_id uuid DEFAULT NULL,
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 8
)
RETURNS TABLE (
  source_table text,
  source_id uuid,
  engagement_id uuid,
  content_text text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.source_table,
    e.source_id,
    e.engagement_id,
    e.content_text,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.embeddings e
  WHERE
    (match_engagement_id IS NULL OR e.engagement_id = match_engagement_id)
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
    AND (auth.role() = 'service_role' OR private.is_engagement_member(e.engagement_id))
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.search_similar_content(vector, uuid, float, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_similar_market_intel(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.78,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  source text,
  title text,
  summary text,
  url text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id, m.source, m.title, m.summary, m.url,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.market_intelligence m
  WHERE m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.search_similar_market_intel(vector, float, int) TO authenticated, service_role;

-- ============================================================
-- OUTCOME PROCESSING TRIGGER (Phase F)
-- Calls the TanStack server route via pg_net when an outcome is recorded.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_outcome_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/process-outcome',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('engagement_id', NEW.engagement_id, 'outcome', NEW.outcome)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_process_outcome
  AFTER INSERT OR UPDATE OF outcome ON public.engagement_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_outcome_processing();

-- ============================================================
-- updated_at triggers for new tables
-- ============================================================
CREATE TRIGGER update_outcomes_updated_at
  BEFORE UPDATE ON public.engagement_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_embeddings_updated_at
  BEFORE UPDATE ON public.embeddings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
