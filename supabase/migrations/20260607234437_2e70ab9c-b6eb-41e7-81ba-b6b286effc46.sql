ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS years_of_experience integer,
  ADD COLUMN IF NOT EXISTS certifications text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS expertise_source text,
  ADD COLUMN IF NOT EXISTS expertise_updated_at timestamptz;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_expertise_source_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_expertise_source_check
  CHECK (expertise_source IS NULL OR expertise_source IN ('resume_upload', 'manual'));