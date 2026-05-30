
-- Sizing data and services checklist on engagement_config
ALTER TABLE public.engagement_config
  ADD COLUMN IF NOT EXISTS sizing_data jsonb,
  ADD COLUMN IF NOT EXISTS sizing_assumptions jsonb,
  ADD COLUMN IF NOT EXISTS services_checklist jsonb,
  ADD COLUMN IF NOT EXISTS submission_days_remaining integer;

-- Evaluation weight on heatmap sections
ALTER TABLE public.heatmap_sections
  ADD COLUMN IF NOT EXISTS evaluation_weight_pct numeric;

-- Question-level sizing + writer assignment
ALTER TABLE public.rfp_questions
  ADD COLUMN IF NOT EXISTS evaluation_weight_pct numeric,
  ADD COLUMN IF NOT EXISTS page_limit numeric,
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.engagement_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rfp_questions_assigned_to_idx ON public.rfp_questions(assigned_to);
