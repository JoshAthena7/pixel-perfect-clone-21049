ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS today_focus text,
  ADD COLUMN IF NOT EXISTS how_we_win text,
  ADD COLUMN IF NOT EXISTS mission_journey text,
  ADD COLUMN IF NOT EXISTS watch_items text;