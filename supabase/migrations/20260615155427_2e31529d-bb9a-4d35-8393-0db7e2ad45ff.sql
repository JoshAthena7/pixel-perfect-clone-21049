-- question_progress
CREATE TABLE IF NOT EXISTS public.question_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  assignee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'lead_writer'
    CONSTRAINT qp_role_check CHECK (role IN ('lead_writer','contributing_sme','editor','graphics','copy_editor','reviewer')),
  status text NOT NULL DEFAULT 'not_started'
    CONSTRAINT qp_status_check CHECK (status IN ('not_started','briefed','in_progress','internal_review','red_team','gold_team','mock_scored','revising','finalized')),
  mock_score numeric,
  max_score numeric,
  internal_due_date date,
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  brief_exported_at timestamptz,
  brief_export_count integer NOT NULL DEFAULT 0,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  status_changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, assignee_id, role)
);

CREATE INDEX IF NOT EXISTS idx_qp_mission ON public.question_progress(mission_id);
CREATE INDEX IF NOT EXISTS idx_qp_question ON public.question_progress(question_id);
CREATE INDEX IF NOT EXISTS idx_qp_assignee ON public.question_progress(assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_qp_status ON public.question_progress(mission_id, status);

GRANT SELECT, INSERT, UPDATE ON public.question_progress TO authenticated;
GRANT ALL ON public.question_progress TO service_role;
ALTER TABLE public.question_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY qp_select ON public.question_progress FOR SELECT TO authenticated
  USING (assignee_id = auth.uid()
    OR private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qp_insert ON public.question_progress FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qp_update ON public.question_progress FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid()
    OR private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qp_delete ON public.question_progress FOR DELETE TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qp_service ON public.question_progress FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER qp_updated_at BEFORE UPDATE ON public.question_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- question_intel_links
CREATE TABLE IF NOT EXISTS public.question_intel_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  signal_id uuid,
  relevance_score integer CONSTRAINT qil_relevance CHECK (relevance_score BETWEEN 0 AND 100),
  relevance_explanation text,
  added_by text NOT NULL DEFAULT 'iris_suggested'
    CONSTRAINT qil_added_by CHECK (added_by IN ('iris_suggested','admin_added','leader_added')),
  confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, signal_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='oracle_signals')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='qil_signal_fk') THEN
    ALTER TABLE public.question_intel_links
      ADD CONSTRAINT qil_signal_fk FOREIGN KEY (signal_id)
      REFERENCES public.oracle_signals(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qil_question ON public.question_intel_links(question_id, confirmed);
CREATE INDEX IF NOT EXISTS idx_qil_mission ON public.question_intel_links(mission_id);

GRANT SELECT, INSERT, UPDATE ON public.question_intel_links TO authenticated;
GRANT ALL ON public.question_intel_links TO service_role;
ALTER TABLE public.question_intel_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY qil_select ON public.question_intel_links FOR SELECT TO authenticated
  USING ((private.is_engagement_member(mission_id) AND confirmed = true)
    OR private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qil_write ON public.question_intel_links FOR ALL TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qil_service ON public.question_intel_links FOR ALL TO service_role USING (true) WITH CHECK (true);

-- question_feedback
CREATE TABLE IF NOT EXISTS public.question_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  review_cycle text NOT NULL
    CONSTRAINT qf_cycle CHECK (review_cycle IN ('internal','red_team','gold_team','mock_score','final','other')),
  feedback_text text NOT NULL,
  priority text NOT NULL DEFAULT 'normal'
    CONSTRAINT qf_priority CHECK (priority IN ('critical','high','normal','minor')),
  status text NOT NULL DEFAULT 'open'
    CONSTRAINT qf_status CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qf_question ON public.question_feedback(question_id, status);
CREATE INDEX IF NOT EXISTS idx_qf_mission ON public.question_feedback(mission_id, status);

GRANT SELECT, INSERT, UPDATE ON public.question_feedback TO authenticated;
GRANT ALL ON public.question_feedback TO service_role;
ALTER TABLE public.question_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY qf_select ON public.question_feedback FOR SELECT TO authenticated
  USING (private.is_engagement_member(mission_id));
CREATE POLICY qf_insert ON public.question_feedback FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qf_update ON public.question_feedback FOR UPDATE TO authenticated
  USING (private.is_engagement_member(mission_id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY qf_service ON public.question_feedback FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER qf_updated_at BEFORE UPDATE ON public.question_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();