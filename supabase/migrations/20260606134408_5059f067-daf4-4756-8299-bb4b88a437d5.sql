
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS writing_voice_sample TEXT,
  ADD COLUMN IF NOT EXISTS preferred_pov TEXT NOT NULL DEFAULT 'we',
  ADD COLUMN IF NOT EXISTS banned_words TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS default_mission_role TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT,
  ADD COLUMN IF NOT EXISTS domain_depth JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_preferred_pov_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_preferred_pov_check
    CHECK (preferred_pov IN ('we','third_person','brand_name'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_default_mission_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_default_mission_role_check
    CHECK (default_mission_role IS NULL OR default_mission_role IN ('writer','sme','reviewer','capture_lead','pm'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_writing_voice_sample_length_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_writing_voice_sample_length_check
    CHECK (writing_voice_sample IS NULL OR char_length(writing_voice_sample) <= 2000);
