CREATE TABLE IF NOT EXISTS public.athena_intelligence_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_url text NOT NULL,
  source_type text NOT NULL
    CONSTRAINT aim_source_type CHECK (source_type IN (
      'agency', 'academic', 'advocacy',
      'regulatory', 'legislative', 'media', 'research'
    )),
  oracle_category text NOT NULL
    CONSTRAINT aim_category CHECK (oracle_category IN (
      'agency_watch', 'procurement_watch', 'policy_watch',
      'competitor_watch', 'stakeholder_watch', 'market_watch'
    )),
  applicable_states text[] NOT NULL DEFAULT '{}',
  applicable_programs text[] NOT NULL DEFAULT '{}',
  applicable_waivers text[] NOT NULL DEFAULT '{}',
  applicable_populations text[] NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'medium'
    CONSTRAINT aim_priority CHECK (priority IN ('low', 'medium', 'high')),
  refresh_cadence text NOT NULL DEFAULT 'daily'
    CONSTRAINT aim_cadence CHECK (refresh_cadence IN (
      'hourly', 'daily', 'weekly', 'manual'
    )),
  is_federal boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  notes text,
  verified_at timestamptz,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aim_states
  ON public.athena_intelligence_map USING gin(applicable_states);
CREATE INDEX IF NOT EXISTS idx_aim_programs
  ON public.athena_intelligence_map USING gin(applicable_programs);
CREATE INDEX IF NOT EXISTS idx_aim_waivers
  ON public.athena_intelligence_map USING gin(applicable_waivers);
CREATE INDEX IF NOT EXISTS idx_aim_category
  ON public.athena_intelligence_map(oracle_category, priority);
CREATE INDEX IF NOT EXISTS idx_aim_federal
  ON public.athena_intelligence_map(is_federal, oracle_category);

GRANT SELECT ON public.athena_intelligence_map TO authenticated;
GRANT ALL ON public.athena_intelligence_map TO service_role;

ALTER TABLE public.athena_intelligence_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY aim_select_authenticated ON public.athena_intelligence_map
  FOR SELECT TO authenticated USING (true);

CREATE POLICY aim_write_admin ON public.athena_intelligence_map
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY aim_service_all ON public.athena_intelligence_map
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_aim_updated_at
  BEFORE UPDATE ON public.athena_intelligence_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();