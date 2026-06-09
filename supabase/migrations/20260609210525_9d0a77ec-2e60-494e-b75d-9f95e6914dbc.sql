ALTER TABLE public.atlas_team_members
  ADD COLUMN IF NOT EXISTS atlas_hipaa_signature text;