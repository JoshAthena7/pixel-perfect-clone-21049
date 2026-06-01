ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(4,1);