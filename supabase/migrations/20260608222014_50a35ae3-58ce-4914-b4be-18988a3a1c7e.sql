ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS assignment_tracker_data JSONB NOT NULL DEFAULT '[]'::jsonb;