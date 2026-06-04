-- =====================================================================
-- Health Monitoring System: pulses, mock scores, IRIS flags
-- =====================================================================

-- 1. question_pulses ---------------------------------------------------
CREATE TABLE public.question_pulses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.question_records(id) ON DELETE SET NULL,
  writer_auth_user_id UUID NOT NULL,
  progress SMALLINT NOT NULL CHECK (progress BETWEEN 1 AND 4),
  blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_reason TEXT,
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 1 AND 5),
  note TEXT,
  hedging_score SMALLINT NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_question_pulses_mission ON public.question_pulses(mission_id, submitted_at DESC);
CREATE INDEX idx_question_pulses_writer ON public.question_pulses(writer_auth_user_id, submitted_at DESC);
CREATE INDEX idx_question_pulses_question ON public.question_pulses(question_id, submitted_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_pulses TO authenticated;
GRANT ALL ON public.question_pulses TO service_role;
ALTER TABLE public.question_pulses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Writers can insert their own pulse"
  ON public.question_pulses FOR INSERT TO authenticated
  WITH CHECK (writer_auth_user_id = auth.uid());

CREATE POLICY "Writers see their own pulses"
  ON public.question_pulses FOR SELECT TO authenticated
  USING (writer_auth_user_id = auth.uid());

CREATE POLICY "Mission members see mission pulses"
  ON public.question_pulses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = question_pulses.mission_id
      AND mm.user_id = auth.uid()
  ));

-- 2. mock_scores -------------------------------------------------------
CREATE TABLE public.mock_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.question_records(id) ON DELETE SET NULL,
  section_name TEXT,
  stage TEXT NOT NULL CHECK (stage IN ('red_team', 'gold_team', 'pink_team', 'other')),
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  threshold_green NUMERIC(5,2) NOT NULL DEFAULT 80,
  threshold_yellow NUMERIC(5,2) NOT NULL DEFAULT 65,
  threshold_critical NUMERIC(5,2) NOT NULL DEFAULT 55,
  evaluator_note TEXT,
  recorded_by UUID NOT NULL,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mock_scores_mission ON public.mock_scores(mission_id, scored_at DESC);
CREATE INDEX idx_mock_scores_question ON public.mock_scores(question_id, stage, scored_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mock_scores TO authenticated;
GRANT ALL ON public.mock_scores TO service_role;
ALTER TABLE public.mock_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members see mock scores"
  ON public.mock_scores FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = mock_scores.mission_id
      AND mm.user_id = auth.uid()
  ));

CREATE POLICY "Mission leads manage mock scores"
  ON public.mock_scores FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = mock_scores.mission_id
      AND mm.user_id = auth.uid()
      AND mm.role IN ('lead', 'owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = mock_scores.mission_id
      AND mm.user_id = auth.uid()
      AND mm.role IN ('lead', 'owner', 'admin')
  ));

-- 3. iris_health_flags -------------------------------------------------
CREATE TABLE public.iris_health_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.question_records(id) ON DELETE SET NULL,
  section_name TEXT,
  subject_writer_id UUID,
  severity TEXT NOT NULL CHECK (severity IN ('urgent', 'watch', 'informational')),
  trigger_code TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  recommended_action TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_iris_health_flags_mission ON public.iris_health_flags(mission_id, status, severity, raised_at DESC);
CREATE INDEX idx_iris_health_flags_writer ON public.iris_health_flags(subject_writer_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iris_health_flags TO authenticated;
GRANT ALL ON public.iris_health_flags TO service_role;
ALTER TABLE public.iris_health_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members see flags"
  ON public.iris_health_flags FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = iris_health_flags.mission_id
      AND mm.user_id = auth.uid()
  ));

CREATE POLICY "Mission leads manage flags"
  ON public.iris_health_flags FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = iris_health_flags.mission_id
      AND mm.user_id = auth.uid()
      AND mm.role IN ('lead', 'owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.mission_id = iris_health_flags.mission_id
      AND mm.user_id = auth.uid()
      AND mm.role IN ('lead', 'owner', 'admin')
  ));

-- updated_at triggers --------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_mock_scores_updated_at
  BEFORE UPDATE ON public.mock_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_iris_health_flags_updated_at
  BEFORE UPDATE ON public.iris_health_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();