
-- ── mission_monitoring_sources ───────────────────────────────────
CREATE TABLE public.mission_monitoring_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_monitoring_sources TO authenticated;
GRANT ALL ON public.mission_monitoring_sources TO service_role;
ALTER TABLE public.mission_monitoring_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read monitoring"
  ON public.mission_monitoring_sources FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_monitoring_sources.mission_id AND mm.user_id = auth.uid()));
CREATE POLICY "leads manage monitoring"
  ON public.mission_monitoring_sources FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_monitoring_sources.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_monitoring_sources.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')));

-- ── mission_evaluation_criteria ─────────────────────────────────
CREATE TABLE public.mission_evaluation_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  sections_covered JSONB NOT NULL DEFAULT '[]'::jsonb,
  competitive_risk TEXT NOT NULL DEFAULT 'medium' CHECK (competitive_risk IN ('low','medium','high')),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_evaluation_criteria TO authenticated;
GRANT ALL ON public.mission_evaluation_criteria TO service_role;
ALTER TABLE public.mission_evaluation_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read evaluation"
  ON public.mission_evaluation_criteria FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_evaluation_criteria.mission_id AND mm.user_id = auth.uid()));
CREATE POLICY "leads manage evaluation"
  ON public.mission_evaluation_criteria FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_evaluation_criteria.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_evaluation_criteria.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')));

-- ── mission_member_expertise ────────────────────────────────────
CREATE TABLE public.mission_member_expertise (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, user_id, tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_member_expertise TO authenticated;
GRANT ALL ON public.mission_member_expertise TO service_role;
ALTER TABLE public.mission_member_expertise ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read expertise"
  ON public.mission_member_expertise FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_member_expertise.mission_id AND mm.user_id = auth.uid()));
CREATE POLICY "leads manage expertise"
  ON public.mission_member_expertise FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_member_expertise.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_member_expertise.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')));

-- ── state_comparables ───────────────────────────────────────────
CREATE TABLE public.state_comparables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL,
  program_name TEXT NOT NULL,
  topic TEXT NOT NULL,
  approach TEXT NOT NULL,
  outcome TEXT,
  source_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.state_comparables TO authenticated;
GRANT ALL ON public.state_comparables TO service_role;
ALTER TABLE public.state_comparables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read comparables"
  ON public.state_comparables FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage comparables"
  ON public.state_comparables FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── mission_debriefs ────────────────────────────────────────────
CREATE TABLE public.mission_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL UNIQUE REFERENCES public.missions(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('won','lost')),
  scored_well TEXT,
  missed TEXT,
  evaluator_feedback TEXT,
  lessons_learned TEXT,
  captured_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_debriefs TO authenticated;
GRANT ALL ON public.mission_debriefs TO service_role;
ALTER TABLE public.mission_debriefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read debriefs"
  ON public.mission_debriefs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_debriefs.mission_id AND mm.user_id = auth.uid()));
CREATE POLICY "leads manage debriefs"
  ON public.mission_debriefs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_debriefs.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_debriefs.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('admin','lead')));

-- ── canon_suggestions ───────────────────────────────────────────
CREATE TABLE public.canon_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  debrief_id UUID REFERENCES public.mission_debriefs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canon_suggestions TO authenticated;
GRANT ALL ON public.canon_suggestions TO service_role;
ALTER TABLE public.canon_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read canon suggestions"
  ON public.canon_suggestions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = canon_suggestions.mission_id AND mm.user_id = auth.uid()));
CREATE POLICY "admins manage canon suggestions"
  ON public.canon_suggestions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── Extensions to existing tables ────────────────────────────────
ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS point_value INTEGER,
  ADD COLUMN IF NOT EXISTS competitive_risk TEXT CHECK (competitive_risk IN ('low','medium','high')),
  ADD COLUMN IF NOT EXISTS iris_pre_brief JSONB;

ALTER TABLE public.mission_vault_documents
  ADD COLUMN IF NOT EXISTS extracted_requirements JSONB,
  ADD COLUMN IF NOT EXISTS extracted_terms TEXT[];

-- ── updated_at triggers ──────────────────────────────────────────
CREATE TRIGGER update_mission_monitoring_sources_updated_at BEFORE UPDATE ON public.mission_monitoring_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mission_evaluation_criteria_updated_at BEFORE UPDATE ON public.mission_evaluation_criteria FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_state_comparables_updated_at BEFORE UPDATE ON public.state_comparables FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_mission_debriefs_updated_at BEFORE UPDATE ON public.mission_debriefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_canon_suggestions_updated_at BEFORE UPDATE ON public.canon_suggestions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
