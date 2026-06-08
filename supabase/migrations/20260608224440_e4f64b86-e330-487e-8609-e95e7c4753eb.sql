-- Extend question_intelligence to support the Step 8 chip-list fields and
-- repoint its FK from the legacy question_records table to the new questions table.

ALTER TABLE public.question_intelligence
  DROP CONSTRAINT IF EXISTS question_intelligence_question_id_fkey;

ALTER TABLE public.question_intelligence
  ADD CONSTRAINT question_intelligence_question_id_fkey
  FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE public.question_intelligence
  ADD COLUMN IF NOT EXISTS win_themes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_doc_refs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compliance_refs JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS best_practices JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS oracle_prompts JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS iris_recommendations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS required_evidence JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();