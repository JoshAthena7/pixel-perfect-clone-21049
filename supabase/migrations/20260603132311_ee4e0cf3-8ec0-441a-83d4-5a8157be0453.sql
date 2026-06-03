-- LAYER 1: Athena Canon
CREATE TABLE IF NOT EXISTS public.intelligence_canon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  category text NOT NULL,
  citation text,
  content text NOT NULL,
  source_url text,
  tags text[] NOT NULL DEFAULT '{}',
  priority int NOT NULL DEFAULT 5,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canon_category ON public.intelligence_canon(category) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_canon_tags ON public.intelligence_canon USING gin(tags);

GRANT SELECT ON public.intelligence_canon TO authenticated;
GRANT ALL ON public.intelligence_canon TO service_role;
ALTER TABLE public.intelligence_canon ENABLE ROW LEVEL SECURITY;

CREATE POLICY canon_select_auth ON public.intelligence_canon
  FOR SELECT TO authenticated USING (true);
CREATE POLICY canon_write_lead ON public.intelligence_canon
  FOR ALL TO authenticated
  USING (public.is_olympus_user(auth.uid()))
  WITH CHECK (public.is_olympus_user(auth.uid()));

-- LAYER 2: State Intelligence
CREATE TABLE IF NOT EXISTS public.state_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,
  section text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  citations text[] NOT NULL DEFAULT '{}',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  last_verified_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_state_intel_lookup ON public.state_intelligence(state_code, section);
CREATE INDEX IF NOT EXISTS idx_state_intel_tags ON public.state_intelligence USING gin(tags);

GRANT SELECT ON public.state_intelligence TO authenticated;
GRANT ALL ON public.state_intelligence TO service_role;
ALTER TABLE public.state_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY state_intel_select_auth ON public.state_intelligence
  FOR SELECT TO authenticated USING (true);
CREATE POLICY state_intel_write_lead ON public.state_intelligence
  FOR ALL TO authenticated
  USING (public.is_olympus_user(auth.uid()))
  WITH CHECK (public.is_olympus_user(auth.uid()));

-- LAYER 3: Program Intelligence
CREATE TABLE IF NOT EXISTS public.program_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_name text NOT NULL,
  state_code text,
  population text,
  eligibility text,
  service_array text,
  operational_requirements text,
  quality_requirements text,
  reporting_requirements text,
  proposal_implications text,
  refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_program_intel_name ON public.program_intelligence(program_name) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_program_intel_state ON public.program_intelligence(state_code);
CREATE INDEX IF NOT EXISTS idx_program_intel_tags ON public.program_intelligence USING gin(tags);

GRANT SELECT ON public.program_intelligence TO authenticated;
GRANT ALL ON public.program_intelligence TO service_role;
ALTER TABLE public.program_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY program_intel_select_auth ON public.program_intelligence
  FOR SELECT TO authenticated USING (true);
CREATE POLICY program_intel_write_lead ON public.program_intelligence
  FOR ALL TO authenticated
  USING (public.is_olympus_user(auth.uid()))
  WITH CHECK (public.is_olympus_user(auth.uid()));

-- LAYER 5: Collective Memory
CREATE TABLE IF NOT EXISTS public.collective_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  summary text NOT NULL,
  detail text,
  source_mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  source_mission_name text,
  program_name text,
  state_code text,
  outcome text,
  score_delta numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  promoted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  promoted_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS idx_collective_kind ON public.collective_memory(kind) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_collective_state ON public.collective_memory(state_code);
CREATE INDEX IF NOT EXISTS idx_collective_program ON public.collective_memory(program_name);
CREATE INDEX IF NOT EXISTS idx_collective_tags ON public.collective_memory USING gin(tags);

GRANT SELECT ON public.collective_memory TO authenticated;
GRANT ALL ON public.collective_memory TO service_role;
ALTER TABLE public.collective_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY collective_select_auth ON public.collective_memory
  FOR SELECT TO authenticated USING (true);
CREATE POLICY collective_write_lead ON public.collective_memory
  FOR ALL TO authenticated
  USING (public.is_olympus_user(auth.uid()))
  WITH CHECK (public.is_olympus_user(auth.uid()));

-- Seed Layer 1
INSERT INTO public.intelligence_canon (topic, category, citation, content, priority) VALUES
  ('Medicaid Managed Care Rule', 'cms_regulation', '42 CFR 438',
   'Federal regulations governing Medicaid managed care: actuarial soundness, network adequacy, quality strategy, beneficiary protections, grievance and appeal systems, program integrity.', 1),
  ('Mental Health Parity', 'federal_statute', 'MHPAEA / 42 CFR 438.910',
   'Mental Health Parity and Addiction Equity Act applies to Medicaid managed care. Quantitative and non-quantitative treatment limitations must be no more restrictive than medical/surgical benefits.', 1),
  ('EPSDT', 'federal_statute', '42 USC 1396d(r)',
   'Early and Periodic Screening, Diagnostic, and Treatment benefit for Medicaid beneficiaries under 21. Comprehensive coverage of all medically necessary services.', 1),
  ('CLAS Standards', 'cms_regulation', 'HHS Office of Minority Health',
   'National Standards for Culturally and Linguistically Appropriate Services in Health and Health Care. Required cultural competence framework for Medicaid contractors.', 2),
  ('Person-First Language', 'writing_standard', 'Athena Style Guide §1',
   'All proposal content uses person-first language. "People with disabilities" not "the disabled." "People with substance use disorder" not "addicts."', 1),
  ('Win Theme Specificity', 'athena_playbook', 'Athena Win-Lab',
   'Every win theme must name a measurable outcome, a method, and a proof point from prior performance. Vague differentiators score 3.0; specific differentiators score 4.5+.', 2)
ON CONFLICT DO NOTHING;