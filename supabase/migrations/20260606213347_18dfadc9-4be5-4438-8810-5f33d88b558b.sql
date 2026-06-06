ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS iris_setup_autofill_status text,
  ADD COLUMN IF NOT EXISTS iris_setup_autofill_at timestamptz,
  ADD COLUMN IF NOT EXISTS iris_setup_suggested_fields jsonb NOT NULL DEFAULT '{}'::jsonb;