-- ============================================================
-- ORACLE Phase 1 — iris_answers table + JSON → table backfill
-- ============================================================

CREATE TABLE IF NOT EXISTS public.iris_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE SET NULL,
  prompt_type text NOT NULL CHECK (prompt_type IN (
    'decode','win_angle','evidence','watch_out',
    'writers_block','brief','daily_focus',
    'inspiration','score_guidance'
  )),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_full jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources_used text[] NOT NULL DEFAULT '{}',
  confidence_level text CHECK (confidence_level IN ('high','medium','low')),
  user_rating integer CHECK (user_rating BETWEEN 1 AND 5),
  user_correction text,
  was_helpful boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_iris_answers_mission
  ON public.iris_answers(mission_id, prompt_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iris_answers_question
  ON public.iris_answers(question_id, prompt_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_iris_answers_feedback
  ON public.iris_answers(mission_id, was_helpful, user_rating);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iris_answers TO authenticated;
GRANT ALL ON public.iris_answers TO service_role;

ALTER TABLE public.iris_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iris_answers_select_members"
  ON public.iris_answers FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR public.is_mission_member_user(mission_id, auth.uid())
  );

CREATE POLICY "iris_answers_insert_members"
  ON public.iris_answers FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_platform_admin(auth.uid())
      OR public.is_mission_member_user(mission_id, auth.uid())
    )
  );

CREATE POLICY "iris_answers_update_own"
  ON public.iris_answers FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_platform_admin(auth.uid()))
  WITH CHECK (created_by = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "iris_answers_delete_admin"
  ON public.iris_answers FOR DELETE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE TRIGGER trg_iris_answers_updated_at
  BEFORE UPDATE ON public.iris_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Backfill mission_proof_points from oracle_engagement_config JSON
-- ============================================================
INSERT INTO public.mission_proof_points
  (mission_id, text, signal_authority, is_manually_added, iris_sources)
SELECT
  oec.mission_id,
  trim(proof->>'text'),
  CASE WHEN (proof->>'client_stated')::boolean THEN 'client_stated' ELSE 'team_validated' END,
  true,
  '[]'::jsonb
FROM public.oracle_engagement_config oec,
     jsonb_array_elements(COALESCE(oec.proof_points, '[]'::jsonb)) AS proof
WHERE oec.proof_points IS NOT NULL
  AND jsonb_typeof(oec.proof_points) = 'array'
  AND jsonb_array_length(oec.proof_points) > 0
  AND COALESCE(trim(proof->>'text'), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.mission_proof_points mpp
    WHERE mpp.mission_id = oec.mission_id
      AND mpp.text = trim(proof->>'text')
  );

-- ============================================================
-- Backfill mission_risks from oracle_engagement_config JSON
-- ============================================================
INSERT INTO public.mission_risks
  (mission_id, title, description, severity, status, created_by_system)
SELECT
  oec.mission_id,
  left(trim(risk->>'text'), 200),
  trim(risk->>'text'),
  'Medium',
  'Open',
  true
FROM public.oracle_engagement_config oec,
     jsonb_array_elements(COALESCE(oec.top_risks, '[]'::jsonb)) AS risk
WHERE oec.top_risks IS NOT NULL
  AND jsonb_typeof(oec.top_risks) = 'array'
  AND jsonb_array_length(oec.top_risks) > 0
  AND COALESCE(trim(risk->>'text'), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.mission_risks mr
    WHERE mr.mission_id = oec.mission_id
      AND mr.description = trim(risk->>'text')
  );