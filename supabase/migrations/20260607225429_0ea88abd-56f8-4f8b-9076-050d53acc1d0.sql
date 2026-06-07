ALTER TABLE public.mission_evaluation_criteria ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS scoring_methodology text;