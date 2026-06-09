
-- ===== mission_win_strategy =====
CREATE TABLE public.mission_win_strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES public.missions(id) ON DELETE CASCADE,
  central_claim text,
  central_claim_confirmed_at timestamptz,
  central_claim_confirmed_by uuid,
  north_star_message text,
  north_star_confirmed_at timestamptz,
  north_star_confirmed_by uuid,
  win_themes text,
  win_themes_confirmed_at timestamptz,
  win_themes_confirmed_by uuid,
  discriminators text,
  discriminators_confirmed_at timestamptz,
  discriminators_confirmed_by uuid,
  proof_points text,
  proof_points_confirmed_at timestamptz,
  proof_points_confirmed_by uuid,
  client_priorities text,
  client_priorities_confirmed_at timestamptz,
  client_priorities_confirmed_by uuid,
  competitor_analysis text,
  competitor_analysis_confirmed_at timestamptz,
  competitor_analysis_confirmed_by uuid,
  risk_mitigation text,
  risk_mitigation_confirmed_at timestamptz,
  risk_mitigation_confirmed_by uuid,
  value_proposition text,
  value_proposition_confirmed_at timestamptz,
  value_proposition_confirmed_by uuid,
  executive_summary text,
  executive_summary_confirmed_at timestamptz,
  executive_summary_confirmed_by uuid,
  admin_confirmed_at timestamptz,
  admin_confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_win_strategy TO authenticated;
GRANT ALL ON public.mission_win_strategy TO service_role;
ALTER TABLE public.mission_win_strategy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mws all" ON public.mission_win_strategy
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()));
CREATE TRIGGER trg_mws_uat BEFORE UPDATE ON public.mission_win_strategy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== mission_journey_phases =====
CREATE TABLE public.mission_journey_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'phase',
  color text,
  start_date timestamptz,
  end_date timestamptz,
  is_locked boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mjp_kind_check CHECK (kind = ANY (ARRAY['phase','gate','milestone','pens_down']))
);
CREATE INDEX idx_mjp_mission ON public.mission_journey_phases(mission_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_journey_phases TO authenticated;
GRANT ALL ON public.mission_journey_phases TO service_role;
ALTER TABLE public.mission_journey_phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mjp all" ON public.mission_journey_phases
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()));
CREATE TRIGGER trg_mjp_uat BEFORE UPDATE ON public.mission_journey_phases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== mission_journey_deliverables =====
CREATE TABLE public.mission_journey_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  phase_id uuid REFERENCES public.mission_journey_phases(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  owner_member_id uuid REFERENCES public.atlas_team_members(id) ON DELETE SET NULL,
  due_date timestamptz,
  status text NOT NULL DEFAULT 'not_started',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mjd_status_check CHECK (status = ANY (ARRAY['not_started','in_progress','complete','blocked']))
);
CREATE INDEX idx_mjd_mission ON public.mission_journey_deliverables(mission_id);
CREATE INDEX idx_mjd_phase ON public.mission_journey_deliverables(phase_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_journey_deliverables TO authenticated;
GRANT ALL ON public.mission_journey_deliverables TO service_role;
ALTER TABLE public.mission_journey_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mjd all" ON public.mission_journey_deliverables
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()));
CREATE TRIGGER trg_mjd_uat BEFORE UPDATE ON public.mission_journey_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== mission_submission_checklist =====
CREATE TABLE public.mission_submission_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  category text,
  label text NOT NULL,
  description text,
  is_complete boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_msc_mission ON public.mission_submission_checklist(mission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_submission_checklist TO authenticated;
GRANT ALL ON public.mission_submission_checklist TO service_role;
ALTER TABLE public.mission_submission_checklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msc all" ON public.mission_submission_checklist
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()));
CREATE TRIGGER trg_msc_uat BEFORE UPDATE ON public.mission_submission_checklist
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== mission_style_guide =====
CREATE TABLE public.mission_style_guide (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES public.missions(id) ON DELETE CASCADE,
  voice text,
  tone text,
  grammar_rules text,
  formatting_rules text,
  terminology text,
  sensitivities text,
  banned_phrases text,
  required_phrases text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_style_guide TO authenticated;
GRANT ALL ON public.mission_style_guide TO service_role;
ALTER TABLE public.mission_style_guide ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msg all" ON public.mission_style_guide
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()));
CREATE TRIGGER trg_msg_uat BEFORE UPDATE ON public.mission_style_guide
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== mission_qa_log =====
CREATE TABLE public.mission_qa_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question text NOT NULL,
  question_submitted_at timestamptz,
  question_submitted_by uuid,
  answer text,
  answer_received_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mqal_status_check CHECK (status = ANY (ARRAY['draft','submitted','answered','closed']))
);
CREATE INDEX idx_mqal_mission ON public.mission_qa_log(mission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_qa_log TO authenticated;
GRANT ALL ON public.mission_qa_log TO service_role;
ALTER TABLE public.mission_qa_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mqal all" ON public.mission_qa_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_mission_team_member(mission_id, auth.uid()));
CREATE TRIGGER trg_mqal_uat BEFORE UPDATE ON public.mission_qa_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
