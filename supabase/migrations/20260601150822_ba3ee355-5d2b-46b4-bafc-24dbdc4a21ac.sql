
-- ============ signals ============
CREATE TABLE public.signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  user_id uuid,
  user_role text,
  source_module text NOT NULL,
  signal_type text NOT NULL,
  signal_title text NOT NULL,
  signal_summary text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical')),
  confidence numeric(3,2) DEFAULT 0.8,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  owner_id uuid,
  related_question_id uuid,
  related_document_id uuid,
  related_decision_id uuid,
  related_risk_id uuid,
  related_conflict_id uuid,
  tags text[],
  recommended_action text,
  created_by_system boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.signals TO authenticated;
GRANT ALL ON public.signals TO service_role;

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY sig_select ON public.signals
  FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY sig_insert_members ON public.signals
  FOR INSERT TO authenticated
  WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE POLICY sig_update_members ON public.signals
  FOR UPDATE TO authenticated
  USING (is_mission_member(mission_id, auth.uid()))
  WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE INDEX idx_signals_mission_created ON public.signals (mission_id, created_at DESC);
CREATE INDEX idx_signals_mission_severity ON public.signals (mission_id, severity);
CREATE INDEX idx_signals_question ON public.signals (related_question_id);

-- ============ mission_assumptions ============
CREATE TABLE public.mission_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  assumption text NOT NULL,
  owner_id uuid,
  confidence_score numeric(3,2) DEFAULT 0.7,
  supporting_evidence text,
  last_validated_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','validated','invalidated','at_risk')),
  risk_if_wrong text,
  next_validation_step text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_assumptions TO authenticated;
GRANT ALL ON public.mission_assumptions TO service_role;

ALTER TABLE public.mission_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY ma_select ON public.mission_assumptions
  FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY ma_write_members ON public.mission_assumptions
  FOR ALL TO authenticated
  USING (is_mission_member(mission_id, auth.uid()))
  WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE TRIGGER update_mission_assumptions_updated_at
  BEFORE UPDATE ON public.mission_assumptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
