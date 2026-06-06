-- PR 5: Sections tracker IRIS columns + intelligence source field

ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS win_theme_alignment_score double precision,
  ADD COLUMN IF NOT EXISTS iris_risk_flag text,
  ADD COLUMN IF NOT EXISTS iris_risk_flag_text text;

ALTER TABLE public.mission_library
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'team';

-- Optional: index for filter
CREATE INDEX IF NOT EXISTS mission_library_source_idx ON public.mission_library(source);
CREATE INDEX IF NOT EXISTS question_records_iris_risk_flag_idx ON public.question_records(iris_risk_flag) WHERE iris_risk_flag IS NOT NULL;