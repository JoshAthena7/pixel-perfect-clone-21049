ALTER TABLE public.mission_questions ADD COLUMN IF NOT EXISTS iris_extracted boolean DEFAULT false;
ALTER TABLE public.mission_questions ADD COLUMN IF NOT EXISTS iris_extracted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_mission_questions_iris_extracted ON public.mission_questions(mission_id, iris_extracted);