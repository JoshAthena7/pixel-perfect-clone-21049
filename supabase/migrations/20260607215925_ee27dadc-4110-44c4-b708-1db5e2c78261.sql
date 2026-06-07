
-- Interview Flight Plans
CREATE TABLE public.interview_flight_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  section_brief_id uuid REFERENCES public.section_briefs(id) ON DELETE SET NULL,
  sme_name text NOT NULL,
  sme_role text NOT NULL,
  sme_organization text,
  sme_type text NOT NULL DEFAULT 'subject_expert',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  additional_context text,
  content jsonb,
  status text NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  completed_at timestamptz,
  generated_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_flight_plans_mission ON public.interview_flight_plans(mission_id);
CREATE INDEX idx_interview_flight_plans_section_brief ON public.interview_flight_plans(section_brief_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_flight_plans TO authenticated;
GRANT ALL ON public.interview_flight_plans TO service_role;

ALTER TABLE public.interview_flight_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members view interview flight plans"
  ON public.interview_flight_plans FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members insert interview flight plans"
  ON public.interview_flight_plans FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members update interview flight plans"
  ON public.interview_flight_plans FOR UPDATE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members delete interview flight plans"
  ON public.interview_flight_plans FOR DELETE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_interview_flight_plans_updated_at
  BEFORE UPDATE ON public.interview_flight_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Interview Debriefs
CREATE TABLE public.interview_debriefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_flight_plan_id uuid NOT NULL REFERENCES public.interview_flight_plans(id) ON DELETE CASCADE,
  iris_analysis jsonb,
  gaps_remaining jsonb,
  stories_extracted jsonb,
  risk_signals jsonb,
  recommended_followup jsonb,
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interview_debriefs_plan ON public.interview_debriefs(interview_flight_plan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_debriefs TO authenticated;
GRANT ALL ON public.interview_debriefs TO service_role;

ALTER TABLE public.interview_debriefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members view interview debriefs"
  ON public.interview_debriefs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.interview_flight_plans p
    WHERE p.id = interview_flight_plan_id
      AND (public.is_mission_member(p.mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

CREATE POLICY "Mission members insert interview debriefs"
  ON public.interview_debriefs FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.interview_flight_plans p
    WHERE p.id = interview_flight_plan_id
      AND (public.is_mission_member(p.mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

CREATE POLICY "Mission members update interview debriefs"
  ON public.interview_debriefs FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.interview_flight_plans p
    WHERE p.id = interview_flight_plan_id
      AND (public.is_mission_member(p.mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));

CREATE POLICY "Mission members delete interview debriefs"
  ON public.interview_debriefs FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.interview_flight_plans p
    WHERE p.id = interview_flight_plan_id
      AND (public.is_mission_member(p.mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  ));
