ALTER TABLE public.mission_questions
  ADD COLUMN IF NOT EXISTS primary_win_theme text,
  ADD COLUMN IF NOT EXISTS secondary_win_theme text,
  ADD COLUMN IF NOT EXISTS evaluator_fear text,
  ADD COLUMN IF NOT EXISTS narrative_role text,
  ADD COLUMN IF NOT EXISTS story_mapped_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'mission_questions_narrative_role_check'
  ) THEN
    ALTER TABLE public.mission_questions
      ADD CONSTRAINT mission_questions_narrative_role_check
      CHECK (narrative_role IS NULL OR narrative_role IN (
        'opens_thread', 'advances_thread', 'closes_thread', 'bridges', 'standalone'
      ));
  END IF;
END $$;