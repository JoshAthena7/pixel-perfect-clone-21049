ALTER TABLE public.oracle_engagement_config
  ADD COLUMN IF NOT EXISTS evaluator_priorities jsonb NOT NULL DEFAULT '[]'::jsonb;