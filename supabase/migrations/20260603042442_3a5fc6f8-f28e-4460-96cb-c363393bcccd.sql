-- Compliance requirements (mission-specific: model contract + state regs)
CREATE TABLE public.compliance_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_document TEXT NOT NULL,
  source_document_id UUID,
  source_kind TEXT NOT NULL DEFAULT 'model_contract', -- 'model_contract' | 'state_regulation' | 'federal'
  section_reference TEXT,
  requirement_text TEXT NOT NULL,
  plain_language TEXT,
  requirement_type TEXT,
  relevant_question_ids UUID[] DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'standard',
  is_federal BOOLEAN NOT NULL DEFAULT false,
  embedding vector(1536),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compliance_reqs_mission ON public.compliance_requirements(mission_id);
CREATE INDEX idx_compliance_reqs_severity ON public.compliance_requirements(severity);
CREATE INDEX idx_compliance_reqs_source_doc ON public.compliance_requirements(source_document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_requirements TO authenticated;
GRANT ALL ON public.compliance_requirements TO service_role;

ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view compliance requirements"
ON public.compliance_requirements FOR SELECT
USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "Mission leads can manage compliance requirements"
ON public.compliance_requirements FOR ALL
USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

CREATE TRIGGER trg_compliance_reqs_updated_at
BEFORE UPDATE ON public.compliance_requirements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Federal compliance library (shared across all missions)
CREATE TABLE public.federal_compliance_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  regulation_name TEXT NOT NULL,
  citation TEXT NOT NULL,
  section_text TEXT NOT NULL,
  plain_language TEXT,
  requirement_type TEXT,
  severity TEXT NOT NULL DEFAULT 'standard',
  program_types TEXT[] DEFAULT '{}',
  effective_date DATE,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fed_compliance_citation ON public.federal_compliance_library(citation);

GRANT SELECT ON public.federal_compliance_library TO authenticated;
GRANT ALL ON public.federal_compliance_library TO service_role;

ALTER TABLE public.federal_compliance_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read federal compliance library"
ON public.federal_compliance_library FOR SELECT
TO authenticated
USING (true);

-- Compliance check results (per question, per Score Me run)
CREATE TABLE public.compliance_check_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  score_me_run_id UUID,
  requirement_id UUID,
  requirement_source TEXT NOT NULL DEFAULT 'mission', -- 'mission' or 'federal'
  requirement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'unknown', -- compliant|partial|non_compliant|conflicting|unknown
  evidence TEXT,
  iris_note TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_compliance_results_question ON public.compliance_check_results(question_id);
CREATE INDEX idx_compliance_results_run ON public.compliance_check_results(score_me_run_id);
CREATE INDEX idx_compliance_results_mission ON public.compliance_check_results(mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_check_results TO authenticated;
GRANT ALL ON public.compliance_check_results TO service_role;

ALTER TABLE public.compliance_check_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view compliance check results"
ON public.compliance_check_results FOR SELECT
USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "Mission members can write compliance check results"
ON public.compliance_check_results FOR INSERT
WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

-- Seed federal compliance library with key CMS Medicaid managed care regulations
INSERT INTO public.federal_compliance_library
  (regulation_name, citation, section_text, plain_language, requirement_type, severity, program_types, effective_date)
VALUES
  ('Medicaid Managed Care — Network Adequacy', '42 CFR 438.68',
   'States must establish quantitative network adequacy standards for MCO provider networks, including time and distance standards for specified provider types.',
   'Responses must commit to maintaining provider network adequacy meeting the state''s time-and-distance standards for primary care, specialists, behavioral health, and other required provider types.',
   'mandatory_commitment', 'critical', ARRAY['Medicaid','MLTSS','MMC'], '2016-07-05'),
  ('Medicaid Managed Care — Cultural Competency', '42 CFR 438.206(c)(2)',
   'MCO must participate in the State''s efforts to promote the delivery of services in a culturally competent manner to all enrollees.',
   'Responses must explicitly commit to culturally competent service delivery and CLAS Standards alignment.',
   'mandatory_commitment', 'critical', ARRAY['Medicaid','MLTSS','MMC'], '2016-07-05'),
  ('Medicaid Managed Care — Care Coordination', '42 CFR 438.208',
   'MCO must implement procedures to deliver primary care to and coordinate health care services for all enrollees.',
   'Responses must describe specific care coordination procedures, including assessment, care planning, and transitions of care.',
   'mandatory_commitment', 'significant', ARRAY['Medicaid','MLTSS','MMC'], '2016-07-05'),
  ('Medicaid Managed Care — Grievance and Appeals', '42 CFR 438 Subpart F',
   'MCO must have a grievance and appeal system that meets federal standards for timeliness, notice, and external review.',
   'Responses must commit to a compliant grievance/appeals system with the federally mandated timelines.',
   'mandatory_commitment', 'critical', ARRAY['Medicaid','MLTSS','MMC'], '2017-07-01'),
  ('CLAS Standards', 'HHS National CLAS Standards',
   'Provide effective, equitable, understandable, and respectful quality care and services that are responsive to diverse cultural health beliefs and practices, preferred languages, health literacy, and other communication needs.',
   'Reference CLAS Standards explicitly. Commit to culturally and linguistically appropriate services across all member touchpoints.',
   'required_language', 'significant', ARRAY['Medicaid','MLTSS','MMC','CHIP'], '2013-04-24'),
  ('Section 1557 Nondiscrimination', '45 CFR Part 92',
   'Prohibits discrimination on the basis of race, color, national origin, sex, age, or disability in covered health programs and activities.',
   'Responses must commit to nondiscrimination consistent with Section 1557, including language access and disability accommodations.',
   'mandatory_commitment', 'critical', ARRAY['Medicaid','MLTSS','MMC','CHIP'], '2016-07-18'),
  ('ADA Title II', '28 CFR Part 35',
   'Public entities must provide accessible programs, services, and activities to individuals with disabilities, including effective communication and physical accessibility.',
   'Responses must address physical, programmatic, and communication accessibility for members with disabilities.',
   'mandatory_commitment', 'significant', ARRAY['Medicaid','MLTSS','MMC','CHIP'], '1991-07-26'),
  ('EPSDT', '42 CFR 441 Subpart B',
   'States must provide Early and Periodic Screening, Diagnostic, and Treatment services for Medicaid-eligible children under age 21.',
   'Responses serving children must commit to full EPSDT compliance, including outreach, screening schedules, and treatment access.',
   'mandatory_commitment', 'critical', ARRAY['Medicaid','CHIP'], '1989-04-01'),
  ('Mental Health Parity', '42 CFR 438.910',
   'MCOs must provide mental health and substance use disorder benefits in parity with medical/surgical benefits.',
   'Responses must commit to MHPAEA-compliant benefit design and utilization management.',
   'mandatory_commitment', 'significant', ARRAY['Medicaid','MLTSS','MMC','CHIP'], '2016-03-30'),
  ('CMS Interoperability and Patient Access', '42 CFR 431.60, 42 CFR 438.62(b)(1)(iv)',
   'MCOs must implement Patient Access API and Provider Directory API to enable data exchange and member access to claims and clinical data.',
   'Responses must commit to CMS Interoperability Rule API implementation and member data access requirements.',
   'mandatory_commitment', 'significant', ARRAY['Medicaid','MLTSS','MMC','CHIP'], '2021-07-01')
ON CONFLICT DO NOTHING;