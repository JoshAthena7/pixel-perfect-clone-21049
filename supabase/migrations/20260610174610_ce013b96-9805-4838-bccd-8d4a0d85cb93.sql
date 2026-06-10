-- Sprint 13: ATLAS Intelligence System schema

-- ============================================================
-- 1. Extend missions table
-- ============================================================
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS state_code text,
  ADD COLUMN IF NOT EXISTS agency_name text,
  ADD COLUMN IF NOT EXISTS agency_code text,
  ADD COLUMN IF NOT EXISTS program_type text,
  ADD COLUMN IF NOT EXISTS intelligence_loadout_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS intelligence_graph_completeness integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monitoring_schedule text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS procurement_evolution_analysis text;

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_program_type_check;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_program_type_check CHECK (
    program_type IS NULL OR program_type IN (
      'managed_care','ltss','idd','childrens_behavioral_health',
      'adult_behavioral_health','child_welfare','dual_eligible','other'
    )
  );

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_monitoring_schedule_check;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_monitoring_schedule_check CHECK (
    monitoring_schedule IN ('hourly','daily','weekly')
  );

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_intelligence_loadout_step_check;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_intelligence_loadout_step_check CHECK (
    intelligence_loadout_step BETWEEN 0 AND 5
  );

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_intelligence_graph_completeness_check;
ALTER TABLE public.missions
  ADD CONSTRAINT missions_intelligence_graph_completeness_check CHECK (
    intelligence_graph_completeness BETWEEN 0 AND 100
  );

-- ============================================================
-- Helper: shared RLS predicate
-- Admin OR mission team member
-- ============================================================
-- Uses existing functions:
--   public.has_role(uuid, app_role)
--   public.is_mission_team_member(uuid, uuid)

-- ============================================================
-- 2. intelligence_feed_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.intelligence_feed_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  feed_type text NOT NULL CHECK (feed_type IN (
    'cms_guidance','federal_register','state_legislative','state_agency_news',
    'research_publications','competitor_news','custom'
  )),
  feed_name text NOT NULL,
  feed_url text,
  feed_description text,
  is_active boolean NOT NULL DEFAULT true,
  is_preselected boolean NOT NULL DEFAULT false,
  preselection_reason text,
  monitoring_schedule text NOT NULL DEFAULT 'daily' CHECK (monitoring_schedule IN ('hourly','daily','weekly')),
  last_checked_at timestamptz,
  last_item_found_at timestamptz,
  total_items_found integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intelligence_feed_configs TO authenticated;
GRANT ALL ON public.intelligence_feed_configs TO service_role;
ALTER TABLE public.intelligence_feed_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_configs_select" ON public.intelligence_feed_configs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "feed_configs_insert" ON public.intelligence_feed_configs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "feed_configs_update" ON public.intelligence_feed_configs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "feed_configs_delete" ON public.intelligence_feed_configs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 3. intelligence_feed_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.intelligence_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  feed_config_id uuid REFERENCES public.intelligence_feed_configs(id) ON DELETE SET NULL,
  category text NOT NULL CHECK (category IN (
    'federal_policy','state_policy','state_legislative','competitive','research','news','internal'
  )),
  headline text NOT NULL,
  summary text,
  full_content text,
  source_url text,
  source_name text,
  published_at timestamptz,
  iris_assessment text,
  iris_relevance_score integer NOT NULL DEFAULT 0 CHECK (iris_relevance_score BETWEEN 0 AND 100),
  affected_section_ids uuid[] NOT NULL DEFAULT '{}',
  recommended_action text,
  is_reviewed boolean NOT NULL DEFAULT false,
  is_dismissed boolean NOT NULL DEFAULT false,
  is_shared_with_team boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intelligence_feed_items TO authenticated;
GRANT ALL ON public.intelligence_feed_items TO service_role;
ALTER TABLE public.intelligence_feed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feed_items_select" ON public.intelligence_feed_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "feed_items_insert" ON public.intelligence_feed_items FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "feed_items_update" ON public.intelligence_feed_items FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "feed_items_delete" ON public.intelligence_feed_items FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 4. intelligence_graph_nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.intelligence_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN (
    'requirement','evaluator','stakeholder','policy','competitor',
    'research','win_theme','risk','internal_knowledge'
  )),
  label text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  source_document_id uuid,
  source_feed_item_id uuid REFERENCES public.intelligence_feed_items(id) ON DELETE SET NULL,
  confidence_level text NOT NULL DEFAULT 'medium' CHECK (confidence_level IN ('high','medium','low')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intelligence_graph_nodes TO authenticated;
GRANT ALL ON public.intelligence_graph_nodes TO service_role;
ALTER TABLE public.intelligence_graph_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "graph_nodes_select" ON public.intelligence_graph_nodes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "graph_nodes_insert" ON public.intelligence_graph_nodes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "graph_nodes_update" ON public.intelligence_graph_nodes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "graph_nodes_delete" ON public.intelligence_graph_nodes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 5. intelligence_graph_edges
-- ============================================================
CREATE TABLE IF NOT EXISTS public.intelligence_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.intelligence_graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.intelligence_graph_nodes(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  relationship_description text,
  strength integer NOT NULL DEFAULT 5 CHECK (strength BETWEEN 1 AND 10),
  is_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT graph_edges_no_self_ref CHECK (source_node_id <> target_node_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intelligence_graph_edges TO authenticated;
GRANT ALL ON public.intelligence_graph_edges TO service_role;
ALTER TABLE public.intelligence_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "graph_edges_select" ON public.intelligence_graph_edges FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "graph_edges_insert" ON public.intelligence_graph_edges FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "graph_edges_update" ON public.intelligence_graph_edges FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "graph_edges_delete" ON public.intelligence_graph_edges FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 6. stakeholder_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stakeholder_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  organization text,
  stakeholder_type text NOT NULL CHECK (stakeholder_type IN (
    'evaluator','influencer','advocate','legislator','media'
  )),
  sub_type text,
  public_priorities text,
  known_concerns text,
  recent_statements jsonb NOT NULL DEFAULT '[]'::jsonb,
  relationship_to_athena text,
  relationship_to_incumbent text,
  iris_confidence text NOT NULL DEFAULT 'low' CHECK (iris_confidence IN ('high','medium','low')),
  iris_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  graph_node_id uuid REFERENCES public.intelligence_graph_nodes(id) ON DELETE SET NULL,
  is_manually_added boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stakeholder_profiles TO authenticated;
GRANT ALL ON public.stakeholder_profiles TO service_role;
ALTER TABLE public.stakeholder_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stakeholder_profiles_select" ON public.stakeholder_profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "stakeholder_profiles_insert" ON public.stakeholder_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "stakeholder_profiles_update" ON public.stakeholder_profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "stakeholder_profiles_delete" ON public.stakeholder_profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 7. competitor_profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.competitor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  organization_name text NOT NULL,
  competitor_type text NOT NULL CHECK (competitor_type IN (
    'incumbent','likely_bidder','possible_bidder','dark_horse'
  )),
  known_relationships text,
  contract_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  protest_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  likely_narrative text,
  known_strengths text,
  known_weaknesses text,
  differentiation_strategy text,
  vulnerability_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  recent_intelligence jsonb NOT NULL DEFAULT '[]'::jsonb,
  executive_movements jsonb NOT NULL DEFAULT '[]'::jsonb,
  iris_confidence text NOT NULL DEFAULT 'low' CHECK (iris_confidence IN ('high','medium','low')),
  iris_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  graph_node_id uuid REFERENCES public.intelligence_graph_nodes(id) ON DELETE SET NULL,
  is_manually_added boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_profiles TO authenticated;
GRANT ALL ON public.competitor_profiles TO service_role;
ALTER TABLE public.competitor_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitor_profiles_select" ON public.competitor_profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "competitor_profiles_insert" ON public.competitor_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "competitor_profiles_update" ON public.competitor_profiles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "competitor_profiles_delete" ON public.competitor_profiles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 8. procurement_evolution_records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.procurement_evolution_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid UNIQUE NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  prior_rfp_document_id uuid,
  current_rfp_document_id uuid,
  material_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  removed_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  tightened_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  relaxed_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  iris_summary text,
  iris_signals text,
  iris_recommendations text,
  analysis_completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_evolution_records TO authenticated;
GRANT ALL ON public.procurement_evolution_records TO service_role;
ALTER TABLE public.procurement_evolution_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evolution_select" ON public.procurement_evolution_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "evolution_insert" ON public.procurement_evolution_records FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "evolution_update" ON public.procurement_evolution_records FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "evolution_delete" ON public.procurement_evolution_records FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 9. daily_intelligence_briefs (append-only/immutable)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.daily_intelligence_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_date date NOT NULL,
  brief_type text NOT NULL CHECK (brief_type IN ('admin_brief','consultant_brief')),
  content jsonb NOT NULL,
  new_feed_items_count integer NOT NULL DEFAULT 0,
  at_risk_questions_count integer NOT NULL DEFAULT 0,
  watch_questions_count integer NOT NULL DEFAULT 0,
  key_intelligence_summary text,
  is_delivered boolean NOT NULL DEFAULT false,
  delivered_at timestamptz,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_intelligence_briefs TO authenticated;
GRANT ALL ON public.daily_intelligence_briefs TO service_role;
ALTER TABLE public.daily_intelligence_briefs ENABLE ROW LEVEL SECURITY;
-- Recipient can read their own brief; admins and mission members can also read
CREATE POLICY "briefs_select" ON public.daily_intelligence_briefs FOR SELECT TO authenticated
  USING (
    recipient_id = auth.uid()
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
  );
CREATE POLICY "briefs_insert" ON public.daily_intelligence_briefs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
-- Allow the recipient to mark their own brief as read/delivered
CREATE POLICY "briefs_update_recipient" ON public.daily_intelligence_briefs FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "briefs_delete" ON public.daily_intelligence_briefs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role));

-- ============================================================
-- 10. intelligence_loadout_history (append-only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.intelligence_loadout_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  performed_by_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.intelligence_loadout_history TO authenticated;
GRANT ALL ON public.intelligence_loadout_history TO service_role;
ALTER TABLE public.intelligence_loadout_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loadout_history_select" ON public.intelligence_loadout_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "loadout_history_insert" ON public.intelligence_loadout_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) AND performed_by = auth.uid());

-- ============================================================
-- 11. updated_at triggers (reuse public.update_updated_at_column)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intelligence_feed_configs',
    'intelligence_feed_items',
    'intelligence_graph_nodes',
    'intelligence_graph_edges',
    'stakeholder_profiles',
    'competitor_profiles',
    'procurement_evolution_records'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$s;
       CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$s
         FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();',
      t
    );
  END LOOP;
END $$;

-- ============================================================
-- 12. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_feed_configs_mission ON public.intelligence_feed_configs(mission_id);
CREATE INDEX IF NOT EXISTS idx_feed_configs_active ON public.intelligence_feed_configs(is_active);

CREATE INDEX IF NOT EXISTS idx_feed_items_mission ON public.intelligence_feed_items(mission_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_config ON public.intelligence_feed_items(feed_config_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_category ON public.intelligence_feed_items(category);
CREATE INDEX IF NOT EXISTS idx_feed_items_relevance ON public.intelligence_feed_items(iris_relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_reviewed ON public.intelligence_feed_items(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_feed_items_dismissed ON public.intelligence_feed_items(is_dismissed);
CREATE INDEX IF NOT EXISTS idx_feed_items_published ON public.intelligence_feed_items(published_at DESC);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_mission ON public.intelligence_graph_nodes(mission_id);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON public.intelligence_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_active ON public.intelligence_graph_nodes(is_active);

CREATE INDEX IF NOT EXISTS idx_graph_edges_mission ON public.intelligence_graph_edges(mission_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON public.intelligence_graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON public.intelligence_graph_edges(target_node_id);

CREATE INDEX IF NOT EXISTS idx_stakeholder_profiles_mission ON public.stakeholder_profiles(mission_id);
CREATE INDEX IF NOT EXISTS idx_stakeholder_profiles_type ON public.stakeholder_profiles(stakeholder_type);

CREATE INDEX IF NOT EXISTS idx_competitor_profiles_mission ON public.competitor_profiles(mission_id);
CREATE INDEX IF NOT EXISTS idx_competitor_profiles_type ON public.competitor_profiles(competitor_type);

CREATE INDEX IF NOT EXISTS idx_briefs_mission ON public.daily_intelligence_briefs(mission_id);
CREATE INDEX IF NOT EXISTS idx_briefs_recipient ON public.daily_intelligence_briefs(recipient_id);
CREATE INDEX IF NOT EXISTS idx_briefs_date ON public.daily_intelligence_briefs(brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_briefs_delivered ON public.daily_intelligence_briefs(is_delivered);
CREATE INDEX IF NOT EXISTS idx_briefs_read ON public.daily_intelligence_briefs(is_read);

CREATE INDEX IF NOT EXISTS idx_loadout_history_mission ON public.intelligence_loadout_history(mission_id);
CREATE INDEX IF NOT EXISTS idx_loadout_history_user ON public.intelligence_loadout_history(performed_by);
