ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_onboarded boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;