ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS mission_highlights text,
  ADD COLUMN IF NOT EXISTS client_strengths text,
  ADD COLUMN IF NOT EXISTS client_win_strategy text,
  ADD COLUMN IF NOT EXISTS program_goals text;