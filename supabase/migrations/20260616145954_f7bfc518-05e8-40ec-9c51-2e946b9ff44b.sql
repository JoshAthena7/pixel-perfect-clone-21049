ALTER TABLE public.mission_questions ADD COLUMN IF NOT EXISTS is_inferred boolean NOT NULL DEFAULT false;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS iris_extraction_status text;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS iris_extraction_note text;