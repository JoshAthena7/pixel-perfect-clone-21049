-- Policy intelligence table
CREATE TABLE public.policy_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('CMS','Federal Register','State Medicaid Agency','MACPAC','KFF','State Legislature','CMS Informational Bulletin','Other')),
  source_detail TEXT,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('New Rule','Guidance','Informational Bulletin','Legislative','State Rule','Regulatory Update','Court Decision')),
  summary TEXT,
  full_text TEXT,
  url TEXT,
  effective_date DATE,
  published_date DATE,
  relevant_states TEXT[] NOT NULL DEFAULT '{}',
  relevant_program_areas TEXT[] NOT NULL DEFAULT '{}',
  cfr_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.policy_intelligence TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.policy_intelligence TO authenticated;
GRANT ALL ON public.policy_intelligence TO service_role;

ALTER TABLE public.policy_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read policy intelligence"
  ON public.policy_intelligence FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leadership can insert policy intelligence"
  ON public.policy_intelligence FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_admin_or_founder());

CREATE POLICY "Leadership can update policy intelligence"
  ON public.policy_intelligence FOR UPDATE TO authenticated
  USING (public.current_user_is_admin_or_founder());

CREATE POLICY "Leadership can delete policy intelligence"
  ON public.policy_intelligence FOR DELETE TO authenticated
  USING (public.current_user_is_admin_or_founder());

CREATE TRIGGER update_policy_intelligence_updated_at
  BEFORE UPDATE ON public.policy_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_policy_intel_published ON public.policy_intelligence (published_date DESC);
CREATE INDEX idx_policy_intel_states ON public.policy_intelligence USING GIN(relevant_states);
CREATE INDEX idx_policy_intel_areas ON public.policy_intelligence USING GIN(relevant_program_areas);

-- Policy <-> section/question mappings
CREATE TABLE public.policy_section_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES public.policy_intelligence(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.heatmap_sections(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.rfp_questions(id) ON DELETE CASCADE,
  writing_implication TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT true,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  writer_acknowledged BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.policy_section_mappings TO authenticated;
GRANT ALL ON public.policy_section_mappings TO service_role;

ALTER TABLE public.policy_section_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read policy mappings"
  ON public.policy_section_mappings FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "Leadership can insert policy mappings"
  ON public.policy_section_mappings FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_admin_or_founder()
    OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
  );

CREATE POLICY "Leadership and writers can update policy mappings"
  ON public.policy_section_mappings FOR UPDATE TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "Leadership can delete policy mappings"
  ON public.policy_section_mappings FOR DELETE TO authenticated
  USING (
    public.current_user_is_admin_or_founder()
    OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
  );

CREATE TRIGGER update_policy_section_mappings_updated_at
  BEFORE UPDATE ON public.policy_section_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_psm_engagement ON public.policy_section_mappings (engagement_id);
CREATE INDEX idx_psm_section ON public.policy_section_mappings (section_id);
CREATE INDEX idx_psm_question ON public.policy_section_mappings (question_id);
CREATE INDEX idx_psm_policy ON public.policy_section_mappings (policy_id);

-- Flag on rfp_questions
ALTER TABLE public.rfp_questions
  ADD COLUMN IF NOT EXISTS policy_flagged BOOLEAN NOT NULL DEFAULT false;