ALTER TABLE public.intel_events ADD COLUMN IF NOT EXISTS source_type text;
CREATE INDEX IF NOT EXISTS idx_intel_events_source_type ON public.intel_events (mission_id, source_type);