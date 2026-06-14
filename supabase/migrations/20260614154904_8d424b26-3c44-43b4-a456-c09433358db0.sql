-- Oracle Risk Pattern Library
CREATE TABLE IF NOT EXISTS public.oracle_risk_patterns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  risk_title text NOT NULL,
  risk_category text,
  times_seen integer NOT NULL DEFAULT 1,
  times_materialized integer NOT NULL DEFAULT 0,
  example_missions uuid[] NOT NULL DEFAULT '{}',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oracle_risk_patterns TO authenticated;
GRANT ALL ON public.oracle_risk_patterns TO service_role;

ALTER TABLE public.oracle_risk_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read oracle_risk_patterns"
  ON public.oracle_risk_patterns FOR SELECT
  TO authenticated
  USING (true);

CREATE UNIQUE INDEX IF NOT EXISTS oracle_risk_patterns_title_lower_idx
  ON public.oracle_risk_patterns (lower(risk_title));

CREATE INDEX IF NOT EXISTS oracle_risk_patterns_top_seen_idx
  ON public.oracle_risk_patterns (times_seen DESC, last_seen_at DESC);

-- mission_risks historical pattern columns
ALTER TABLE public.mission_risks
  ADD COLUMN IF NOT EXISTS historical_note text;

ALTER TABLE public.mission_risks
  ADD COLUMN IF NOT EXISTS times_seen_historically integer;
