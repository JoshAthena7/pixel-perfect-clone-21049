ALTER TABLE public.mission_client_intel
  ADD COLUMN IF NOT EXISTS last_advocate_scrub_at timestamptz;