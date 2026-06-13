-- Extend experts table to support mission-scoped capture from thread mentions.
ALTER TABLE public.experts
  ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS key_insights text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS focus_areas text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS experts_mission_id_idx ON public.experts(mission_id);
