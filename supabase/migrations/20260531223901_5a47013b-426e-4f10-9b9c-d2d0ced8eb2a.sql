
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS mission_type text,
  ADD COLUMN IF NOT EXISTS program text,
  ADD COLUMN IF NOT EXISTS engagement_lead text,
  ADD COLUMN IF NOT EXISTS project_manager text,
  ADD COLUMN IF NOT EXISTS executive_sponsor text;
