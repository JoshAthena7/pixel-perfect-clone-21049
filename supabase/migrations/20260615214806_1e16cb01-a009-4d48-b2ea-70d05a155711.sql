ALTER TABLE public.oracle_engagement_config
  ADD COLUMN IF NOT EXISTS central_claim text,
  ADD COLUMN IF NOT EXISTS discriminators jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS proof_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb;