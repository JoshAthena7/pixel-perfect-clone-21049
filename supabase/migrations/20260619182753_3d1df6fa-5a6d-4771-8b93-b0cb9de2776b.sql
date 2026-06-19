ALTER TABLE public.mission_documents ADD COLUMN IF NOT EXISTS style_guide_text text;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;