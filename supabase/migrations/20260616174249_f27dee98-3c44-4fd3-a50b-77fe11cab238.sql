ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS leadership_broadcast text,
  ADD COLUMN IF NOT EXISTS leadership_broadcast_author text;