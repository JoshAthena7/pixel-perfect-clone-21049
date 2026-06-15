ALTER TABLE public.mission_questions
  ADD COLUMN IF NOT EXISTS point_value numeric,
  ADD COLUMN IF NOT EXISTS evaluation_weight numeric,
  ADD COLUMN IF NOT EXISTS requires_exhibit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exhibit_description text,
  ADD COLUMN IF NOT EXISTS brief_notes text,
  ADD COLUMN IF NOT EXISTS iris_decoded_intent text,
  ADD COLUMN IF NOT EXISTS iris_brief jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS iris_brief_status text NOT NULL DEFAULT 'pending'
    CONSTRAINT mq_brief_status_check
    CHECK (iris_brief_status IN ('pending','queued','generating','ready','stale','error')),
  ADD COLUMN IF NOT EXISTS iris_brief_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS iris_evidence jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_mq_brief_status
  ON public.mission_questions(mission_id, iris_brief_status);

COMMENT ON COLUMN public.mission_questions.iris_brief IS
  'IRIS brief JSONB. Shape: { decoded_intent, evaluation_focus, win_theme_connections[], oracle_signals[], iris_evidence[], client_proof_points_prompt, language_guidance{use[],avoid[]}, compliance_checklist[], recommended_approach, competitive_intel }. CRITICAL: iris_evidence = industry-level proof points only. Client proof points (performance data, outcomes, case studies) live in the CLIENT ENVIRONMENT. Never stored in ATLAS.';