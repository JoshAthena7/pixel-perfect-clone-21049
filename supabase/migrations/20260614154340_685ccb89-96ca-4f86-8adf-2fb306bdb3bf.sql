-- Add significance column to intel_events and create brief_update_signals.

ALTER TABLE public.intel_events
  ADD COLUMN IF NOT EXISTS significance text;

ALTER TABLE public.intel_events
  DROP CONSTRAINT IF EXISTS intel_events_significance_check;
ALTER TABLE public.intel_events
  ADD CONSTRAINT intel_events_significance_check
  CHECK (significance IS NULL OR significance IN ('high','medium','low'));

CREATE INDEX IF NOT EXISTS intel_events_mission_significance_idx
  ON public.intel_events (mission_id, significance);

CREATE TABLE IF NOT EXISTS public.brief_update_signals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  intel_event_id uuid REFERENCES public.intel_events(id) ON DELETE CASCADE,
  affected_sections text[] NOT NULL DEFAULT '{}',
  reason text,
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brief_update_signals TO authenticated;
GRANT ALL ON public.brief_update_signals TO service_role;

ALTER TABLE public.brief_update_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read brief_update_signals"
  ON public.brief_update_signals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can update brief_update_signals"
  ON public.brief_update_signals FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS brief_update_signals_mission_active_idx
  ON public.brief_update_signals (mission_id, dismissed, created_at DESC);
