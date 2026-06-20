
-- 1) New columns on question_notes
ALTER TABLE public.question_notes
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'insight',
  ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS seen_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reply_to_note_id uuid REFERENCES public.question_notes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_escalation_at timestamptz,
  ADD COLUMN IF NOT EXISTS slack_posted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slack_posted_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'question_notes_note_type_check'
  ) THEN
    ALTER TABLE public.question_notes
      ADD CONSTRAINT question_notes_note_type_check
      CHECK (note_type IN ('decision','question','blocker','insight'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_question_notes_unresolved
  ON public.question_notes(mission_id, note_type, is_resolved, created_at)
  WHERE is_resolved = false AND note_type IN ('question','blocker');

CREATE INDEX IF NOT EXISTS idx_question_notes_question
  ON public.question_notes(question_id, created_at DESC);

-- 2) Escalation function
CREATE OR REPLACE FUNCTION public.escalate_unanswered_notes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  note_record RECORD;
  hours_elapsed float;
BEGIN
  FOR note_record IN
    SELECT
      qn.id, qn.mission_id, qn.question_id, qn.created_by, qn.created_at,
      qn.note_type, qn.escalation_level,
      mq.question_number
    FROM public.question_notes qn
    JOIN public.mission_questions mq ON mq.id = qn.question_id
    WHERE qn.is_resolved = false
      AND qn.note_type IN ('question','blocker')
      AND qn.reply_to_note_id IS NULL
      AND qn.escalation_level < 3
  LOOP
    hours_elapsed := EXTRACT(EPOCH FROM (now() - note_record.created_at)) / 3600.0;

    IF hours_elapsed >= 12 AND note_record.escalation_level < 1 THEN
      INSERT INTO public.atlas_notifications (recipient_role, recipient_id, type, message, metadata)
      VALUES (
        'specific_user',
        note_record.created_by,
        'sticky_note_escalation',
        format('Your %s on Q%s has not been seen yet (%sh). Consider flagging your lead directly.',
          note_record.note_type, note_record.question_number, ROUND(hours_elapsed)::text),
        jsonb_build_object(
          'note_id', note_record.id,
          'question_id', note_record.question_id,
          'mission_id', note_record.mission_id,
          'escalation_level', 1
        )
      );
      UPDATE public.question_notes
        SET escalation_level = 1, last_escalation_at = now()
      WHERE id = note_record.id;

    ELSIF hours_elapsed >= 24 AND note_record.escalation_level < 2 THEN
      INSERT INTO public.atlas_notifications (recipient_role, type, message, metadata)
      VALUES (
        'engagement_lead',
        'sticky_note_escalation',
        format('Q%s has an unanswered %s — %sh with no response.',
          note_record.question_number, note_record.note_type, ROUND(hours_elapsed)::text),
        jsonb_build_object(
          'note_id', note_record.id,
          'question_id', note_record.question_id,
          'mission_id', note_record.mission_id,
          'escalation_level', 2
        )
      );
      UPDATE public.question_notes
        SET escalation_level = 2, last_escalation_at = now()
      WHERE id = note_record.id;

    ELSIF hours_elapsed >= 48 AND note_record.escalation_level < 3 THEN
      UPDATE public.question_notes
        SET escalation_level = 3, last_escalation_at = now()
      WHERE id = note_record.id;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.escalate_unanswered_notes() TO service_role;
