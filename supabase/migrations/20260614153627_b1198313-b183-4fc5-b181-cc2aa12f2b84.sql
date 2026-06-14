CREATE TABLE IF NOT EXISTS public.mission_pulse_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id),
  pulse_date date DEFAULT CURRENT_DATE,
  sentiment text CHECK (sentiment IN ('green','yellow','red')),
  update_text text,
  blockers text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id, submitted_by, pulse_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_pulse_log TO authenticated;
GRANT ALL ON public.mission_pulse_log TO service_role;

ALTER TABLE public.mission_pulse_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read mission pulse log"
  ON public.mission_pulse_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users can record own pulse"
  ON public.mission_pulse_log FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = submitted_by);

CREATE POLICY "Users can update own pulse"
  ON public.mission_pulse_log FOR UPDATE
  TO authenticated USING (auth.uid() = submitted_by) WITH CHECK (auth.uid() = submitted_by);

CREATE INDEX IF NOT EXISTS idx_mission_pulse_log_mission_date
  ON public.mission_pulse_log (mission_id, pulse_date DESC);