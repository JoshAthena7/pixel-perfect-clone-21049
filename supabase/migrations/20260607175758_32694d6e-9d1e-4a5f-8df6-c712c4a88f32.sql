
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS is_decision boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS decision_starred_by uuid,
  ADD COLUMN IF NOT EXISTS decision_starred_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_note text;

CREATE INDEX IF NOT EXISTS idx_comments_decisions
  ON public.comments (thread_id, decision_starred_at DESC)
  WHERE is_decision = true;
