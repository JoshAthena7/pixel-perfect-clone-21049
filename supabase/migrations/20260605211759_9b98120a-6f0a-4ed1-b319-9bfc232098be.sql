ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS parent_question_id uuid REFERENCES public.question_records(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_qr_parent ON public.question_records(parent_question_id);