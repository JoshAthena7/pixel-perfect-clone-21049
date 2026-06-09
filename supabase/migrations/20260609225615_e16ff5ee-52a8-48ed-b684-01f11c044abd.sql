
DROP TABLE IF EXISTS public.missions CASCADE;
DROP TABLE IF EXISTS public.question_records CASCADE;
DROP TABLE IF EXISTS public.mission_members CASCADE;
DROP TABLE IF EXISTS public.mission_team_members CASCADE;
DROP TABLE IF EXISTS public.mission_volumes CASCADE;
DROP TABLE IF EXISTS public.mission_sections CASCADE;
DROP TABLE IF EXISTS public.mission_documents CASCADE;
DROP TABLE IF EXISTS public.mission_library CASCADE;
DROP FUNCTION IF EXISTS public.is_mission_team_member(uuid, uuid);

CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client_name text,
  procurement_type text CHECK (procurement_type IN ('managed_care_rfp','csa','bpo','consulting','other')),
  submission_deadline timestamptz NOT NULL,
  contract_value numeric,
  primary_contact_name text,
  primary_contact_email text,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','active','pens_down','submitted','awarded','not_awarded','archived')),
  blast_off_at timestamptz,
  blast_off_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_missions_updated_at BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mission_volumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name text, order_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mv_mission_id ON public.mission_volumes(mission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_volumes TO authenticated;
GRANT ALL ON public.mission_volumes TO service_role;
ALTER TABLE public.mission_volumes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_mv_uat BEFORE UPDATE ON public.mission_volumes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mission_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  volume_id uuid REFERENCES public.mission_volumes(id) ON DELETE CASCADE,
  parent_section_id uuid REFERENCES public.mission_sections(id) ON DELETE CASCADE,
  section_number text, name text, page_limit integer, evaluation_weight numeric,
  description text,
  iris_confidence text CHECK (iris_confidence IN ('high','medium','low')),
  reviewed_by_admin boolean NOT NULL DEFAULT false,
  order_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ms_mission_id ON public.mission_sections(mission_id);
CREATE INDEX idx_ms_volume_id ON public.mission_sections(volume_id);
CREATE INDEX idx_ms_parent_id ON public.mission_sections(parent_section_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_sections TO authenticated;
GRANT ALL ON public.mission_sections TO service_role;
ALTER TABLE public.mission_sections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ms_uat BEFORE UPDATE ON public.mission_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mission_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.mission_sections(id) ON DELETE CASCADE,
  question_number text, question_text text, word_limit integer, page_limit integer,
  evaluation_criteria text, due_date timestamptz,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','complete','overdue','withdrawn')),
  health_status text NOT NULL DEFAULT 'healthy' CHECK (health_status IN ('healthy','watch','at_risk')),
  health_calculated_at timestamptz,
  iris_confidence text CHECK (iris_confidence IN ('high','medium','low')),
  reviewed_by_admin boolean NOT NULL DEFAULT false,
  is_withdrawn boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mq_mission_id ON public.mission_questions(mission_id);
CREATE INDEX idx_mq_section_id ON public.mission_questions(section_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_questions TO authenticated;
GRANT ALL ON public.mission_questions TO service_role;
ALTER TABLE public.mission_questions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_mq_uat BEFORE UPDATE ON public.mission_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mission_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  assigned_writer_id uuid REFERENCES public.atlas_team_members(id) ON DELETE SET NULL,
  acceptance_status text NOT NULL DEFAULT 'pending' CHECK (acceptance_status IN ('pending','accepted','need_help','capacity_concern')),
  acceptance_responded_at timestamptz,
  writer_confidence text NOT NULL DEFAULT 'not_set' CHECK (writer_confidence IN ('high','medium','low','not_set')),
  due_date timestamptz, assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ma_mission_id ON public.mission_assignments(mission_id);
CREATE INDEX idx_ma_question_id ON public.mission_assignments(question_id);
CREATE INDEX idx_ma_writer_id ON public.mission_assignments(assigned_writer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_assignments TO authenticated;
GRANT ALL ON public.mission_assignments TO service_role;
ALTER TABLE public.mission_assignments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ma_uat BEFORE UPDATE ON public.mission_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mission_assignment_smes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.mission_assignments(id) ON DELETE CASCADE,
  sme_member_id uuid NOT NULL REFERENCES public.atlas_team_members(id) ON DELETE CASCADE,
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mas_assignment_id ON public.mission_assignment_smes(assignment_id);
CREATE INDEX idx_mas_sme_id ON public.mission_assignment_smes(sme_member_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_assignment_smes TO authenticated;
GRANT ALL ON public.mission_assignment_smes TO service_role;
ALTER TABLE public.mission_assignment_smes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mission_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.atlas_team_members(id) ON DELETE CASCADE,
  mission_role text CHECK (mission_role IN ('engagement_lead','writer','sme','reviewer')),
  added_by uuid,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mtm_mission_id ON public.mission_team_members(mission_id);
CREATE INDEX idx_mtm_member_id ON public.mission_team_members(member_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_team_members TO authenticated;
GRANT ALL ON public.mission_team_members TO service_role;
ALTER TABLE public.mission_team_members ENABLE ROW LEVEL SECURITY;

-- Helper: link signed-in user to atlas_team_members via email
CREATE OR REPLACE FUNCTION public.is_mission_team_member(_mission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mission_team_members mtm
    JOIN public.atlas_team_members atm ON atm.id = mtm.member_id
    JOIN auth.users u ON lower(u.email) = lower(atm.email)
    WHERE mtm.mission_id = _mission_id AND u.id = _user_id
  );
$$;

CREATE POLICY "missions select" ON public.missions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "missions insert" ON public.missions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "missions update" ON public.missions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(id, auth.uid()) OR created_by = auth.uid())
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(id, auth.uid()) OR created_by = auth.uid());
CREATE POLICY "missions delete" ON public.missions FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "mv all" ON public.mission_volumes FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "ms all" ON public.mission_sections FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "mq all" ON public.mission_questions FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "ma all" ON public.mission_assignments FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "mas all" ON public.mission_assignment_smes FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR EXISTS (
  SELECT 1 FROM public.mission_assignments a WHERE a.id = assignment_id AND public.is_mission_team_member(a.mission_id, auth.uid())
))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR EXISTS (
  SELECT 1 FROM public.mission_assignments a WHERE a.id = assignment_id AND public.is_mission_team_member(a.mission_id, auth.uid())
));

CREATE POLICY "mtm select" ON public.mission_team_members FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND m.created_by = auth.uid()));
CREATE POLICY "mtm insert" ON public.mission_team_members FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()) OR EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND m.created_by = auth.uid()));
CREATE POLICY "mtm update" ON public.mission_team_members FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
CREATE POLICY "mtm delete" ON public.mission_team_members FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.is_mission_team_member(mission_id, auth.uid()));
