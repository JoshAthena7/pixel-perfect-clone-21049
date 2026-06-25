
CREATE TABLE IF NOT EXISTS public.compliance_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.mission_documents(id) ON DELETE SET NULL,
  document_type text NOT NULL CHECK (document_type IN ('model_contract','scope_of_work')),
  obligation_text text NOT NULL,
  obligation_summary text,
  obligation_type text,
  section_reference text,
  relevant_question_numbers text[] DEFAULT '{}',
  applies_to_all boolean DEFAULT false,
  risk_level text DEFAULT 'medium' CHECK (risk_level IN ('critical','high','medium','low')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_obligations TO authenticated;
GRANT ALL ON public.compliance_obligations TO service_role;
ALTER TABLE public.compliance_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads obligations" ON public.compliance_obligations
  FOR SELECT TO authenticated
  USING (public.is_mission_team_member(mission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Team writes obligations" ON public.compliance_obligations
  FOR ALL TO authenticated
  USING (public.is_mission_team_member(mission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.is_mission_team_member(mission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_compliance_obligations_mission ON public.compliance_obligations(mission_id);
CREATE INDEX IF NOT EXISTS idx_compliance_obligations_questions ON public.compliance_obligations USING GIN(relevant_question_numbers);

CREATE TABLE IF NOT EXISTS public.question_compliance_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES public.compliance_obligations(id) ON DELETE CASCADE,
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','compliant','conflict','not_applicable','needs_review')),
  verification_note text,
  iris_assessment text,
  iris_confidence numeric(3,2),
  iris_flag text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, obligation_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_compliance_checks TO authenticated;
GRANT ALL ON public.question_compliance_checks TO service_role;
ALTER TABLE public.question_compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team reads checks" ON public.question_compliance_checks
  FOR SELECT TO authenticated
  USING (public.is_mission_team_member(mission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Team writes checks" ON public.question_compliance_checks
  FOR ALL TO authenticated
  USING (public.is_mission_team_member(mission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.is_mission_team_member(mission_id, auth.uid()) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_qcc_question ON public.question_compliance_checks(question_id);
CREATE INDEX IF NOT EXISTS idx_qcc_mission ON public.question_compliance_checks(mission_id);
CREATE INDEX IF NOT EXISTS idx_qcc_status ON public.question_compliance_checks(verification_status);

CREATE OR REPLACE FUNCTION public.update_compliance_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_compliance_obligations_updated ON public.compliance_obligations;
CREATE TRIGGER trg_compliance_obligations_updated
  BEFORE UPDATE ON public.compliance_obligations
  FOR EACH ROW EXECUTE FUNCTION public.update_compliance_updated_at();

DROP TRIGGER IF EXISTS trg_question_compliance_checks_updated ON public.question_compliance_checks;
CREATE TRIGGER trg_question_compliance_checks_updated
  BEFORE UPDATE ON public.question_compliance_checks
  FOR EACH ROW EXECUTE FUNCTION public.update_compliance_updated_at();
