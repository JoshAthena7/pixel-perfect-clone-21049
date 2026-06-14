ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS debrief_completed boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.oracle_mission_outcomes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  outcome text CHECK (outcome IN ('won','lost','no_award','cancelled')),
  outcome_factor text,
  win_theme_notes text,
  competitor_observations text,
  top_lesson text,
  completed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oracle_mission_outcomes TO authenticated;
GRANT ALL ON public.oracle_mission_outcomes TO service_role;

ALTER TABLE public.oracle_mission_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read mission outcomes"
  ON public.oracle_mission_outcomes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert mission outcomes"
  ON public.oracle_mission_outcomes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = completed_by);

CREATE INDEX IF NOT EXISTS idx_oracle_mission_outcomes_mission_id
  ON public.oracle_mission_outcomes (mission_id, created_at DESC);