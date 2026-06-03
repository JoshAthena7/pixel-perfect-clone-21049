ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
UPDATE public.profiles SET is_platform_admin = true;