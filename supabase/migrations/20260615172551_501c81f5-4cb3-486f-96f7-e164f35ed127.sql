CREATE TABLE IF NOT EXISTS public.mission_ecosystem_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  node_type text NOT NULL
    CONSTRAINT men_type CHECK (node_type IN (
      'mission','agency','procurement','policy',
      'competitor','stakeholder','legislative','media','internal'
    )),
  label text NOT NULL,
  signal_count integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz,
  status text NOT NULL DEFAULT 'gray'
    CONSTRAINT men_status CHECK (status IN ('green','yellow','red','gray')),
  confidence integer NOT NULL DEFAULT 0
    CONSTRAINT men_confidence CHECK (confidence BETWEEN 0 AND 100),
  coverage_pct integer NOT NULL DEFAULT 0
    CONSTRAINT men_coverage CHECK (coverage_pct BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id, node_type)
);

CREATE INDEX IF NOT EXISTS idx_men_mission
  ON public.mission_ecosystem_nodes(mission_id, is_active);

GRANT SELECT ON public.mission_ecosystem_nodes TO authenticated;
GRANT ALL ON public.mission_ecosystem_nodes TO service_role;
ALTER TABLE public.mission_ecosystem_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY men_select ON public.mission_ecosystem_nodes
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(mission_id));
CREATE POLICY men_service ON public.mission_ecosystem_nodes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY men_admin ON public.mission_ecosystem_nodes
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER men_updated_at
  BEFORE UPDATE ON public.mission_ecosystem_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mission_intelligence_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  iris_status text NOT NULL DEFAULT 'active'
    CONSTRAINT mih_status CHECK (iris_status IN ('active','offline','needs_review')),
  last_scan_at timestamptz,
  last_signal_at timestamptz,
  source_coverage_pct integer NOT NULL DEFAULT 0,
  stakeholder_visibility_pct integer NOT NULL DEFAULT 0,
  policy_visibility_pct integer NOT NULL DEFAULT 0,
  competitive_visibility_pct integer NOT NULL DEFAULT 0,
  overall_confidence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id)
);

GRANT SELECT ON public.mission_intelligence_health TO authenticated;
GRANT ALL ON public.mission_intelligence_health TO service_role;
ALTER TABLE public.mission_intelligence_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY mih_select ON public.mission_intelligence_health
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(mission_id));
CREATE POLICY mih_service ON public.mission_intelligence_health
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY mih_admin ON public.mission_intelligence_health
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TRIGGER mih_updated_at
  BEFORE UPDATE ON public.mission_intelligence_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();