
-- ============ ORACLE V1 SCHEMA ============

-- oracle_engagement_config
CREATE TABLE IF NOT EXISTS public.oracle_engagement_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES public.missions(id) ON DELETE CASCADE,
  north_star text,
  win_themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  top_risks jsonb NOT NULL DEFAULT '[]'::jsonb,
  signal_threshold integer NOT NULL DEFAULT 40,
  monitoring_mode text NOT NULL DEFAULT 'balanced'
    CONSTRAINT oracle_config_mode CHECK (monitoring_mode IN ('conservative','balanced','aggressive')),
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT oracle_config_status CHECK (status IN ('draft','active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- oracle_sources
CREATE TABLE IF NOT EXISTS public.oracle_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_url text,
  source_type text NOT NULL
    CONSTRAINT oracle_source_type CHECK (source_type IN (
      'agency','procurement','policy','competitor','stakeholder','market','internal'
    )),
  category text NOT NULL
    CONSTRAINT oracle_source_category CHECK (category IN (
      'agency_watch','procurement_watch','policy_watch',
      'competitor_watch','stakeholder_watch','market_watch'
    )),
  priority text NOT NULL DEFAULT 'medium'
    CONSTRAINT oracle_source_priority CHECK (priority IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT oracle_source_status CHECK (status IN ('active','paused','ignored')),
  added_by text NOT NULL DEFAULT 'iris_generated'
    CONSTRAINT oracle_source_added_by CHECK (added_by IN ('iris_generated','admin_added','system')),
  refresh_cadence text NOT NULL DEFAULT 'daily'
    CONSTRAINT oracle_source_cadence CHECK (refresh_cadence IN ('hourly','daily','weekly','manual')),
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- oracle_raw_items
CREATE TABLE IF NOT EXISTS public.oracle_raw_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.oracle_sources(id) ON DELETE SET NULL,
  title text NOT NULL,
  url text,
  raw_text text,
  summary text,
  published_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  content_hash text,
  duplicate_of uuid REFERENCES public.oracle_raw_items(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new'
    CONSTRAINT oracle_raw_status CHECK (status IN ('new','processed','archived','error')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id, content_hash)
);

-- oracle_signals
CREATE TABLE IF NOT EXISTS public.oracle_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  raw_item_id uuid REFERENCES public.oracle_raw_items(id) ON DELETE SET NULL,
  signal_type text NOT NULL
    CONSTRAINT oracle_signal_type CHECK (signal_type IN (
      'policy','procurement','competitor','stakeholder','market','operational'
    )),
  title text NOT NULL,
  what_happened text,
  why_it_matters text,
  recommended_action text,
  confidence_score integer NOT NULL DEFAULT 50
    CONSTRAINT oracle_confidence_range CHECK (confidence_score BETWEEN 0 AND 100),
  relevance_score integer NOT NULL DEFAULT 50
    CONSTRAINT oracle_relevance_range CHECK (relevance_score BETWEEN 0 AND 100),
  impact_score integer NOT NULL DEFAULT 50
    CONSTRAINT oracle_impact_range CHECK (impact_score BETWEEN 0 AND 100),
  urgency_score integer NOT NULL DEFAULT 50
    CONSTRAINT oracle_urgency_range CHECK (urgency_score BETWEEN 0 AND 100),
  oracle_score integer GENERATED ALWAYS AS (
    ROUND(
      (relevance_score * 0.40) +
      (urgency_score   * 0.25) +
      (impact_score    * 0.25) +
      (confidence_score * 0.10)
    )::int
  ) STORED,
  status text NOT NULL DEFAULT 'needs_review'
    CONSTRAINT oracle_signal_status CHECK (status IN (
      'draft','needs_review','approved','rejected','archived','pushed'
    )),
  visibility text NOT NULL DEFAULT 'admin_only'
    CONSTRAINT oracle_signal_visibility CHECK (visibility IN (
      'admin_only','leadership','all_users'
    )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- oracle_signal_tags
CREATE TABLE IF NOT EXISTS public.oracle_signal_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.oracle_signals(id) ON DELETE CASCADE,
  tag_type text NOT NULL
    CONSTRAINT oracle_tag_type CHECK (tag_type IN (
      'win_theme','risk','question','section','stakeholder','competitor'
    )),
  tag_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- oracle_beliefs
CREATE TABLE IF NOT EXISTS public.oracle_beliefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  belief_text text NOT NULL,
  belief_type text NOT NULL
    CONSTRAINT oracle_belief_type CHECK (belief_type IN (
      'win_theme','risk','assumption','stakeholder','competitor','policy'
    )),
  confidence integer NOT NULL DEFAULT 50
    CONSTRAINT oracle_belief_confidence CHECK (confidence BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT oracle_belief_status CHECK (status IN ('active','challenged','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- oracle_signal_belief_links
CREATE TABLE IF NOT EXISTS public.oracle_signal_belief_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.oracle_signals(id) ON DELETE CASCADE,
  belief_id uuid NOT NULL REFERENCES public.oracle_beliefs(id) ON DELETE CASCADE,
  relationship text NOT NULL
    CONSTRAINT oracle_belief_relationship CHECK (relationship IN ('supports','challenges','creates')),
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- oracle_outputs
CREATE TABLE IF NOT EXISTS public.oracle_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  signal_id uuid REFERENCES public.oracle_signals(id) ON DELETE SET NULL,
  output_type text NOT NULL
    CONSTRAINT oracle_output_type CHECK (output_type IN (
      'mission_brief','how_we_win','flight_risk','todays_focus',
      'mission_pulse','question_brief'
    )),
  title text NOT NULL,
  content text NOT NULL,
  target_question_id uuid,
  target_section_id uuid,
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT oracle_output_status CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- oracle_health
CREATE TABLE IF NOT EXISTS public.oracle_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  total_sources integer NOT NULL DEFAULT 0,
  active_sources integer NOT NULL DEFAULT 0,
  raw_items_ingested integer NOT NULL DEFAULT 0,
  signals_created integer NOT NULL DEFAULT 0,
  signals_approved integer NOT NULL DEFAULT 0,
  signals_archived integer NOT NULL DEFAULT 0,
  noise_ratio numeric,
  coverage_gaps jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_status text NOT NULL DEFAULT 'green'
    CONSTRAINT oracle_health_status CHECK (health_status IN ('green','yellow','red')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_oracle_config_mission       ON public.oracle_engagement_config(mission_id);
CREATE INDEX IF NOT EXISTS idx_oracle_sources_mission      ON public.oracle_sources(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_oracle_raw_items_mission    ON public.oracle_raw_items(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_oracle_raw_items_source     ON public.oracle_raw_items(source_id);
CREATE INDEX IF NOT EXISTS idx_oracle_signals_mission      ON public.oracle_signals(mission_id, status, oracle_score DESC);
CREATE INDEX IF NOT EXISTS idx_oracle_signals_type         ON public.oracle_signals(signal_type, status);
CREATE INDEX IF NOT EXISTS idx_oracle_signal_tags_signal   ON public.oracle_signal_tags(signal_id);
CREATE INDEX IF NOT EXISTS idx_oracle_beliefs_mission      ON public.oracle_beliefs(mission_id, status);
CREATE INDEX IF NOT EXISTS idx_oracle_outputs_mission      ON public.oracle_outputs(mission_id, output_type, status);
CREATE INDEX IF NOT EXISTS idx_oracle_health_mission       ON public.oracle_health(mission_id, created_at DESC);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE         ON public.oracle_engagement_config   TO authenticated;
GRANT ALL                            ON public.oracle_engagement_config   TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oracle_sources             TO authenticated;
GRANT ALL                            ON public.oracle_sources             TO service_role;
GRANT SELECT                         ON public.oracle_raw_items           TO authenticated;
GRANT ALL                            ON public.oracle_raw_items           TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.oracle_signals             TO authenticated;
GRANT ALL                            ON public.oracle_signals             TO service_role;
GRANT SELECT, INSERT                 ON public.oracle_signal_tags         TO authenticated;
GRANT ALL                            ON public.oracle_signal_tags         TO service_role;
GRANT SELECT, INSERT, UPDATE         ON public.oracle_beliefs             TO authenticated;
GRANT ALL                            ON public.oracle_beliefs             TO service_role;
GRANT SELECT, INSERT                 ON public.oracle_signal_belief_links TO authenticated;
GRANT ALL                            ON public.oracle_signal_belief_links TO service_role;
GRANT SELECT                         ON public.oracle_outputs             TO authenticated;
GRANT ALL                            ON public.oracle_outputs             TO service_role;
GRANT SELECT                         ON public.oracle_health              TO authenticated;
GRANT ALL                            ON public.oracle_health              TO service_role;

-- ============ RLS ============
ALTER TABLE public.oracle_engagement_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_sources             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_raw_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_signals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_signal_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_beliefs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_signal_belief_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_outputs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oracle_health              ENABLE ROW LEVEL SECURITY;

-- oracle_engagement_config
DROP POLICY IF EXISTS oracle_config_select  ON public.oracle_engagement_config;
DROP POLICY IF EXISTS oracle_config_write   ON public.oracle_engagement_config;
DROP POLICY IF EXISTS oracle_config_service ON public.oracle_engagement_config;
CREATE POLICY oracle_config_select ON public.oracle_engagement_config
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_config_write ON public.oracle_engagement_config
  FOR ALL TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_config_service ON public.oracle_engagement_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_sources
DROP POLICY IF EXISTS oracle_sources_select  ON public.oracle_sources;
DROP POLICY IF EXISTS oracle_sources_write   ON public.oracle_sources;
DROP POLICY IF EXISTS oracle_sources_service ON public.oracle_sources;
CREATE POLICY oracle_sources_select ON public.oracle_sources
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_sources_write ON public.oracle_sources
  FOR ALL TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_sources_service ON public.oracle_sources
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_raw_items
DROP POLICY IF EXISTS oracle_raw_select  ON public.oracle_raw_items;
DROP POLICY IF EXISTS oracle_raw_service ON public.oracle_raw_items;
CREATE POLICY oracle_raw_select ON public.oracle_raw_items
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_raw_service ON public.oracle_raw_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_signals
DROP POLICY IF EXISTS oracle_signals_select  ON public.oracle_signals;
DROP POLICY IF EXISTS oracle_signals_write   ON public.oracle_signals;
DROP POLICY IF EXISTS oracle_signals_service ON public.oracle_signals;
CREATE POLICY oracle_signals_select ON public.oracle_signals
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_signals_write ON public.oracle_signals
  FOR ALL TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_signals_service ON public.oracle_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_signal_tags
DROP POLICY IF EXISTS oracle_tags_select  ON public.oracle_signal_tags;
DROP POLICY IF EXISTS oracle_tags_service ON public.oracle_signal_tags;
CREATE POLICY oracle_tags_select ON public.oracle_signal_tags
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.oracle_signals s
    WHERE s.id = signal_id
      AND (private.has_engagement_role(s.mission_id, ARRAY['founder','pm','engagement_lead'])
        OR public.is_platform_admin(auth.uid()))
  ));
CREATE POLICY oracle_tags_service ON public.oracle_signal_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_beliefs
DROP POLICY IF EXISTS oracle_beliefs_select  ON public.oracle_beliefs;
DROP POLICY IF EXISTS oracle_beliefs_write   ON public.oracle_beliefs;
DROP POLICY IF EXISTS oracle_beliefs_service ON public.oracle_beliefs;
CREATE POLICY oracle_beliefs_select ON public.oracle_beliefs
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_beliefs_write ON public.oracle_beliefs
  FOR ALL TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_beliefs_service ON public.oracle_beliefs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_signal_belief_links
DROP POLICY IF EXISTS oracle_belief_links_select  ON public.oracle_signal_belief_links;
DROP POLICY IF EXISTS oracle_belief_links_service ON public.oracle_signal_belief_links;
CREATE POLICY oracle_belief_links_select ON public.oracle_signal_belief_links
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.oracle_beliefs b
    WHERE b.id = belief_id
      AND (private.has_engagement_role(b.mission_id, ARRAY['founder','pm','engagement_lead'])
        OR public.is_platform_admin(auth.uid()))
  ));
CREATE POLICY oracle_belief_links_service ON public.oracle_signal_belief_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_outputs
DROP POLICY IF EXISTS oracle_outputs_select_leadership ON public.oracle_outputs;
DROP POLICY IF EXISTS oracle_outputs_write             ON public.oracle_outputs;
DROP POLICY IF EXISTS oracle_outputs_service           ON public.oracle_outputs;
CREATE POLICY oracle_outputs_select_leadership ON public.oracle_outputs
  FOR SELECT TO authenticated
  USING (
    private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid())
    OR (private.is_engagement_member(mission_id) AND status = 'published')
  );
CREATE POLICY oracle_outputs_write ON public.oracle_outputs
  FOR ALL TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_outputs_service ON public.oracle_outputs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- oracle_health
DROP POLICY IF EXISTS oracle_health_select  ON public.oracle_health;
DROP POLICY IF EXISTS oracle_health_service ON public.oracle_health;
CREATE POLICY oracle_health_select ON public.oracle_health
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
      OR public.is_platform_admin(auth.uid()));
CREATE POLICY oracle_health_service ON public.oracle_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============ updated_at TRIGGERS ============
DROP TRIGGER IF EXISTS trg_oracle_config_updated_at  ON public.oracle_engagement_config;
CREATE TRIGGER trg_oracle_config_updated_at  BEFORE UPDATE ON public.oracle_engagement_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_oracle_sources_updated_at ON public.oracle_sources;
CREATE TRIGGER trg_oracle_sources_updated_at BEFORE UPDATE ON public.oracle_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_oracle_signals_updated_at ON public.oracle_signals;
CREATE TRIGGER trg_oracle_signals_updated_at BEFORE UPDATE ON public.oracle_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_oracle_beliefs_updated_at ON public.oracle_beliefs;
CREATE TRIGGER trg_oracle_beliefs_updated_at BEFORE UPDATE ON public.oracle_beliefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_oracle_outputs_updated_at ON public.oracle_outputs;
CREATE TRIGGER trg_oracle_outputs_updated_at BEFORE UPDATE ON public.oracle_outputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
