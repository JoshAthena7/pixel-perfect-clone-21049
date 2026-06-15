
-- ============================================================
-- ATLAS Question Health Engine — schema + triggers
-- ============================================================

-- 1. Extend question_progress with the columns the health engine needs
ALTER TABLE public.question_progress
  ADD COLUMN IF NOT EXISTS acceptance_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS writer_confidence text,
  ADD COLUMN IF NOT EXISTS assigned_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS accepted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS brief_opened_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS sme_assigned      boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='qp_acceptance_check') THEN
    ALTER TABLE public.question_progress
      ADD CONSTRAINT qp_acceptance_check
      CHECK (acceptance_status IN ('pending','accepted','need_help','capacity_concern'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='qp_confidence_check') THEN
    ALTER TABLE public.question_progress
      ADD CONSTRAINT qp_confidence_check
      CHECK (writer_confidence IS NULL OR writer_confidence IN ('high','medium','low'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qp_acceptance
  ON public.question_progress(acceptance_status, assigned_at);

-- 2. Extend question_feedback with mock score columns
ALTER TABLE public.question_feedback
  ADD COLUMN IF NOT EXISTS mock_score numeric,
  ADD COLUMN IF NOT EXISTS max_score  numeric DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_qf_question_status
  ON public.question_feedback(question_id, status);

-- 3. Extend mission_sections with coherence tracking
ALTER TABLE public.mission_sections
  ADD COLUMN IF NOT EXISTS coherence_status        text DEFAULT 'unreviewed',
  ADD COLUMN IF NOT EXISTS coherence_reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coherence_reviewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS coherence_notes         text,
  ADD COLUMN IF NOT EXISTS central_claim_reflected boolean DEFAULT false;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ms_coherence_status_check') THEN
    ALTER TABLE public.mission_sections
      ADD CONSTRAINT ms_coherence_status_check
      CHECK (coherence_status IN ('unreviewed','aligned','needs_revision','escalated'));
  END IF;
END $$;

-- 4. mission_assist_events
CREATE TABLE IF NOT EXISTS public.mission_assist_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id  uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE SET NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN (
    'brief_opened','brief_exported','assist_acknowledged','assist_ignored',
    'feedback_submitted','sos_raised','status_updated'
  )),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mae_mission   ON public.mission_assist_events(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mae_question  ON public.mission_assist_events(question_id, event_type);
CREATE INDEX IF NOT EXISTS idx_mae_user      ON public.mission_assist_events(user_id, mission_id);

GRANT SELECT, INSERT ON public.mission_assist_events TO authenticated;
GRANT ALL            ON public.mission_assist_events TO service_role;
ALTER TABLE public.mission_assist_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mae_select ON public.mission_assist_events;
CREATE POLICY mae_select ON public.mission_assist_events FOR SELECT TO authenticated
  USING (public.is_mission_member(auth.uid(), mission_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS mae_insert ON public.mission_assist_events;
CREATE POLICY mae_insert ON public.mission_assist_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
              AND (public.is_mission_member(auth.uid(), mission_id) OR public.has_role(auth.uid(), 'admin')));

COMMENT ON TABLE public.mission_assist_events IS
  'Behavioral event log. Fires on brief_opened, brief_exported, assist_acknowledged, '
  'assist_ignored, feedback_submitted, sos_raised, status_updated. '
  'Health engine reads this for engagement signals.';

-- 5. mission_pulse_updates
CREATE TABLE IF NOT EXISTS public.mission_pulse_updates (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id              uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  domain                  text NOT NULL CHECK (domain IN (
    'stakeholder','competitive','political','regulatory','program','financial'
  )),
  updated_by              uuid NOT NULL REFERENCES auth.users(id),
  notes                   text,
  triggered_brief_refresh boolean NOT NULL DEFAULT false,
  affected_question_ids   uuid[] NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mpu_mission_domain
  ON public.mission_pulse_updates(mission_id, domain, created_at DESC);

GRANT SELECT, INSERT ON public.mission_pulse_updates TO authenticated;
GRANT ALL            ON public.mission_pulse_updates TO service_role;
ALTER TABLE public.mission_pulse_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpu_select ON public.mission_pulse_updates;
CREATE POLICY mpu_select ON public.mission_pulse_updates FOR SELECT TO authenticated
  USING (public.is_mission_member(auth.uid(), mission_id) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS mpu_insert ON public.mission_pulse_updates;
CREATE POLICY mpu_insert ON public.mission_pulse_updates FOR INSERT TO authenticated
  WITH CHECK (updated_by = auth.uid()
              AND (public.is_mission_member(auth.uid(), mission_id) OR public.has_role(auth.uid(), 'admin')));

COMMENT ON TABLE public.mission_pulse_updates IS
  'One row per intelligence domain refresh. Health engine reads MAX(created_at) per domain '
  'to compute pulse staleness. triggered_brief_refresh flags whether downstream briefs were updated.';

-- 6. Triggers — flag health_calculated_at = NULL so recompute jobs pick the row up

CREATE OR REPLACE FUNCTION public.trigger_health_on_progress_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.status            IS DISTINCT FROM OLD.status
     OR NEW.acceptance_status IS DISTINCT FROM OLD.acceptance_status
     OR NEW.writer_confidence IS DISTINCT FROM OLD.writer_confidence
     OR NEW.mock_score        IS DISTINCT FROM OLD.mock_score
     OR NEW.brief_opened_at   IS DISTINCT FROM OLD.brief_opened_at
     OR NEW.brief_exported_at IS DISTINCT FROM OLD.brief_exported_at
     OR NEW.sme_assigned      IS DISTINCT FROM OLD.sme_assigned
     OR NEW.last_activity_at  IS DISTINCT FROM OLD.last_activity_at
  THEN
    UPDATE public.mission_questions
       SET health_calculated_at = NULL
     WHERE id = NEW.question_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS qp_health_trigger ON public.question_progress;
CREATE TRIGGER qp_health_trigger
  AFTER INSERT OR UPDATE ON public.question_progress
  FOR EACH ROW EXECUTE FUNCTION public.trigger_health_on_progress_change();


CREATE OR REPLACE FUNCTION public.trigger_health_on_feedback_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.mission_questions
     SET health_calculated_at = NULL
   WHERE id = NEW.question_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS qf_health_trigger ON public.question_feedback;
CREATE TRIGGER qf_health_trigger
  AFTER INSERT OR UPDATE ON public.question_feedback
  FOR EACH ROW EXECUTE FUNCTION public.trigger_health_on_feedback_change();


CREATE OR REPLACE FUNCTION public.trigger_health_on_assist_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_type IN ('brief_opened','brief_exported','sos_raised','status_updated')
     AND NEW.question_id IS NOT NULL THEN

    UPDATE public.question_progress
       SET last_activity_at   = NEW.created_at,
           brief_opened_at    = CASE
             WHEN NEW.event_type = 'brief_opened' AND brief_opened_at IS NULL
             THEN NEW.created_at ELSE brief_opened_at END,
           brief_exported_at  = CASE
             WHEN NEW.event_type = 'brief_exported'
             THEN NEW.created_at ELSE brief_exported_at END,
           brief_export_count = CASE
             WHEN NEW.event_type = 'brief_exported'
             THEN COALESCE(brief_export_count,0) + 1 ELSE brief_export_count END
     WHERE question_id = NEW.question_id
       AND assignee_id = NEW.user_id;

    UPDATE public.mission_questions
       SET health_calculated_at = NULL
     WHERE id = NEW.question_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mae_health_trigger ON public.mission_assist_events;
CREATE TRIGGER mae_health_trigger
  AFTER INSERT ON public.mission_assist_events
  FOR EACH ROW EXECUTE FUNCTION public.trigger_health_on_assist_event();
