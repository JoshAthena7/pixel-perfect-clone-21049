
-- =====================================================================
-- ATLAS — Foundational 5-Layer Intelligence Schema
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. atlas_states
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_states (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code      text UNIQUE NOT NULL,
  state_name      text NOT NULL,
  agency_structure      text,
  managed_care_model    text,
  procurement_history   text,
  political_environment text,
  medicaid_authority    text,
  iris_state_brief      text,
  iris_brief_updated_at timestamptz,
  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
GRANT SELECT ON public.atlas_states TO authenticated;
GRANT ALL ON public.atlas_states TO service_role;
ALTER TABLE public.atlas_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_states_read ON public.atlas_states FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_states_admin_write ON public.atlas_states FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 2. atlas_programs
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_programs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code        text UNIQUE NOT NULL,
  program_name        text NOT NULL,
  state_code          text REFERENCES public.atlas_states(state_code),
  program_type        text,
  program_overview    text,
  population_served   text,
  eligibility         text,
  service_array       text,
  operational_requirements text,
  quality_requirements text,
  reporting_requirements text,
  proposal_implications text,
  current_contractor  text,
  contract_value      text,
  contract_term       text,
  last_procurement    date,
  next_procurement    date,
  procurement_notes   text,
  iris_program_brief  text,
  iris_brief_updated_at timestamptz,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
GRANT SELECT ON public.atlas_programs TO authenticated;
GRANT ALL ON public.atlas_programs TO service_role;
ALTER TABLE public.atlas_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_programs_read ON public.atlas_programs FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_programs_admin_write ON public.atlas_programs FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 3. atlas_sources (the document layer)
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_sources (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             text UNIQUE NOT NULL DEFAULT ('src_' || replace(gen_random_uuid()::text,'-','')),
  knowledge_layer       text NOT NULL CHECK (knowledge_layer IN ('canon','state','program','mission','collective')),
  state_code            text REFERENCES public.atlas_states(state_code),
  program_code          text REFERENCES public.atlas_programs(program_code),
  mission_id            uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  source_title          text NOT NULL,
  source_url            text,
  source_type           text,
  issuing_authority     text,
  authority_score       int CHECK (authority_score BETWEEN 1 AND 10),
  version               text,
  status                text DEFAULT 'active' CHECK (status IN ('active','superseded','under_review','archived')),
  library_category      text,
  tags                  text[] DEFAULT '{}',
  related_entities      text[] DEFAULT '{}',
  topic_category        text,
  programs_applicable   text[] DEFAULT '{}',
  states_applicable     text[] DEFAULT '{}',
  date_published        date,
  date_last_reviewed    date,
  date_last_ingested    timestamptz DEFAULT now(),
  date_last_checked     timestamptz,
  summary               text,
  key_requirements      jsonb DEFAULT '[]'::jsonb,
  key_definitions       jsonb DEFAULT '[]'::jsonb,
  citation_ready_quotes jsonb DEFAULT '[]'::jsonb,
  proposal_implications jsonb DEFAULT '[]'::jsonb,
  related_concepts      text[] DEFAULT '{}',
  related_playbook_chapters text[] DEFAULT '{}',
  related_rfp_questions uuid[] DEFAULT '{}',
  change_history        jsonb DEFAULT '[]'::jsonb,
  source_file_id        uuid,
  source_raw_text       text,
  embedding             vector(1536),
  ingestion_confidence  text DEFAULT 'medium',
  ingestion_notes       text,
  needs_human_review    boolean DEFAULT false,
  review_reason         text,
  promoted_from_mission uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  promoted_at           timestamptz,
  promoted_by           uuid REFERENCES auth.users(id),
  ingested_by           uuid REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
CREATE INDEX atlas_sources_layer_idx     ON public.atlas_sources (knowledge_layer);
CREATE INDEX atlas_sources_state_idx     ON public.atlas_sources (state_code);
CREATE INDEX atlas_sources_program_idx   ON public.atlas_sources (program_code);
CREATE INDEX atlas_sources_mission_idx   ON public.atlas_sources (mission_id);
CREATE INDEX atlas_sources_status_idx    ON public.atlas_sources (status);
CREATE INDEX atlas_sources_tags_idx      ON public.atlas_sources USING gin (tags);
CREATE INDEX atlas_sources_embed_idx     ON public.atlas_sources USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
GRANT SELECT ON public.atlas_sources TO authenticated;
GRANT INSERT, UPDATE ON public.atlas_sources TO authenticated;
GRANT ALL ON public.atlas_sources TO service_role;
ALTER TABLE public.atlas_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_sources_read ON public.atlas_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_sources_admin_write ON public.atlas_sources FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY atlas_sources_mission_member_insert ON public.atlas_sources FOR INSERT TO authenticated
  WITH CHECK (
    knowledge_layer = 'mission'
    AND mission_id IS NOT NULL
    AND public.is_mission_member(mission_id, auth.uid())
  );
CREATE POLICY atlas_sources_mission_member_update ON public.atlas_sources FOR UPDATE TO authenticated
  USING (
    knowledge_layer = 'mission'
    AND mission_id IS NOT NULL
    AND public.is_mission_member(mission_id, auth.uid())
  )
  WITH CHECK (
    knowledge_layer = 'mission'
    AND mission_id IS NOT NULL
    AND public.is_mission_member(mission_id, auth.uid())
  );

-- ---------------------------------------------------------------------
-- 4. atlas_entities
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_entities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  entity_name       text NOT NULL,
  entity_type       text NOT NULL,
  description       text,
  knowledge_layer   text,
  state_code        text,
  program_code      text,
  parent_entity     text,
  related_entities  text[] DEFAULT '{}',
  key_sources       uuid[] DEFAULT '{}',
  notes             text,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX atlas_entities_layer_idx ON public.atlas_entities (knowledge_layer);
GRANT SELECT ON public.atlas_entities TO authenticated;
GRANT ALL ON public.atlas_entities TO service_role;
ALTER TABLE public.atlas_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_entities_read ON public.atlas_entities FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_entities_admin_write ON public.atlas_entities FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 5. atlas_playbook_chapters
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_playbook_chapters (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_code      text UNIQUE NOT NULL,
  chapter_title     text NOT NULL,
  knowledge_layer   text NOT NULL CHECK (knowledge_layer IN ('canon','program')),
  program_code      text,
  state_code        text,
  overview          text,
  key_principles    jsonb DEFAULT '[]'::jsonb,
  writing_guidance  jsonb DEFAULT '[]'::jsonb,
  common_mistakes   jsonb DEFAULT '[]'::jsonb,
  winning_patterns  jsonb DEFAULT '[]'::jsonb,
  example_language  jsonb DEFAULT '[]'::jsonb,
  related_sources   uuid[] DEFAULT '{}',
  related_entities  text[] DEFAULT '{}',
  related_chapters  text[] DEFAULT '{}',
  applicable_rfq_types text[] DEFAULT '{}',
  iris_summary      text,
  version           int DEFAULT 1,
  is_active         boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);
GRANT SELECT ON public.atlas_playbook_chapters TO authenticated;
GRANT ALL ON public.atlas_playbook_chapters TO service_role;
ALTER TABLE public.atlas_playbook_chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_playbook_read ON public.atlas_playbook_chapters FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_playbook_admin_write ON public.atlas_playbook_chapters FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 6. atlas_lessons_learned (Collective Memory)
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_lessons_learned (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  lesson_type         text NOT NULL,
  lesson_body         text NOT NULL,
  source_mission_ids  uuid[] DEFAULT '{}',
  win_or_loss         text DEFAULT 'unknown',
  confidence          text DEFAULT 'medium',
  applies_to_states   text[] DEFAULT '{}',
  applies_to_programs text[] DEFAULT '{}',
  applies_to_question_types text[] DEFAULT '{}',
  authority_score     int DEFAULT 7,
  iris_memory_id      uuid,
  promoted_by         uuid REFERENCES auth.users(id),
  promoted_at         timestamptz DEFAULT now(),
  last_applied_at     timestamptz,
  times_applied       int DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX atlas_lessons_states_idx ON public.atlas_lessons_learned USING gin (applies_to_states);
CREATE INDEX atlas_lessons_programs_idx ON public.atlas_lessons_learned USING gin (applies_to_programs);
GRANT SELECT ON public.atlas_lessons_learned TO authenticated;
GRANT ALL ON public.atlas_lessons_learned TO service_role;
ALTER TABLE public.atlas_lessons_learned ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_lessons_read ON public.atlas_lessons_learned FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_lessons_admin_write ON public.atlas_lessons_learned FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 7. atlas_knowledge_objects
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_knowledge_objects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type         text NOT NULL,
  knowledge_layer     text NOT NULL CHECK (knowledge_layer IN ('canon','state','program','mission','collective')),
  state_code          text,
  program_code        text,
  mission_id          uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  title               text,
  body                text NOT NULL,
  verbatim_quote      text,
  section_reference   text,
  page_reference      text,
  source_id           uuid REFERENCES public.atlas_sources(id) ON DELETE CASCADE,
  issuing_authority   text,
  authority_score     int,
  tags                text[] DEFAULT '{}',
  entities_tagged     text[] DEFAULT '{}',
  topic_category      text,
  proposal_use_case   text,
  related_objects     uuid[] DEFAULT '{}',
  related_questions   uuid[] DEFAULT '{}',
  related_chapters    text[] DEFAULT '{}',
  embedding           vector(1536),
  retrieval_count     int DEFAULT 0,
  last_retrieved_at   timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX atlas_ko_layer_idx ON public.atlas_knowledge_objects (knowledge_layer);
CREATE INDEX atlas_ko_source_idx ON public.atlas_knowledge_objects (source_id);
CREATE INDEX atlas_ko_embed_idx ON public.atlas_knowledge_objects USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
GRANT SELECT ON public.atlas_knowledge_objects TO authenticated;
GRANT ALL ON public.atlas_knowledge_objects TO service_role;
ALTER TABLE public.atlas_knowledge_objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_ko_read ON public.atlas_knowledge_objects FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_ko_admin_write ON public.atlas_knowledge_objects FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 8. atlas_source_requirements
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_source_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid REFERENCES public.atlas_sources(id) ON DELETE CASCADE,
  requirement       text NOT NULL,
  section_ref       text,
  verbatim          text,
  requirement_type  text,
  entities_tagged   text[] DEFAULT '{}',
  knowledge_layer   text,
  state_code        text,
  program_code      text,
  embedding         vector(1536),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX atlas_req_source_idx ON public.atlas_source_requirements (source_id);
CREATE INDEX atlas_req_embed_idx ON public.atlas_source_requirements USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
GRANT SELECT ON public.atlas_source_requirements TO authenticated;
GRANT ALL ON public.atlas_source_requirements TO service_role;
ALTER TABLE public.atlas_source_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_req_read ON public.atlas_source_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_req_admin_write ON public.atlas_source_requirements FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 9. atlas_source_definitions
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_source_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       uuid REFERENCES public.atlas_sources(id) ON DELETE CASCADE,
  term            text NOT NULL,
  definition      text NOT NULL,
  section_ref     text,
  is_verbatim     boolean DEFAULT true,
  knowledge_layer text,
  program_code    text,
  created_at      timestamptz DEFAULT now()
);
CREATE INDEX atlas_def_source_idx ON public.atlas_source_definitions (source_id);
GRANT SELECT ON public.atlas_source_definitions TO authenticated;
GRANT ALL ON public.atlas_source_definitions TO service_role;
ALTER TABLE public.atlas_source_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_def_read ON public.atlas_source_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_def_admin_write ON public.atlas_source_definitions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 10. atlas_source_citations
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_source_citations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid REFERENCES public.atlas_sources(id) ON DELETE CASCADE,
  quote_text        text NOT NULL,
  section_ref       text,
  page_ref          text,
  proposal_use_case text,
  tags              text[] DEFAULT '{}',
  knowledge_layer   text,
  program_code      text,
  embedding         vector(1536),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX atlas_cite_source_idx ON public.atlas_source_citations (source_id);
CREATE INDEX atlas_cite_embed_idx ON public.atlas_source_citations USING ivfflat (embedding vector_cosine_ops) WITH (lists=100);
GRANT SELECT ON public.atlas_source_citations TO authenticated;
GRANT ALL ON public.atlas_source_citations TO service_role;
ALTER TABLE public.atlas_source_citations ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_cite_read ON public.atlas_source_citations FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_cite_admin_write ON public.atlas_source_citations FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 11. atlas_source_question_links
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_source_question_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid REFERENCES public.atlas_sources(id) ON DELETE CASCADE,
  question_id       uuid REFERENCES public.question_records(id) ON DELETE CASCADE,
  relevance_score   decimal,
  connection_type   text DEFAULT 'auto_matched',
  linked_by         uuid REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now(),
  UNIQUE (source_id, question_id)
);
CREATE INDEX atlas_sql_question_idx ON public.atlas_source_question_links (question_id);
GRANT SELECT, INSERT, DELETE ON public.atlas_source_question_links TO authenticated;
GRANT ALL ON public.atlas_source_question_links TO service_role;
ALTER TABLE public.atlas_source_question_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_sql_read ON public.atlas_source_question_links FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_sql_write ON public.atlas_source_question_links FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 12. atlas_source_monitor_log
-- ---------------------------------------------------------------------
CREATE TABLE public.atlas_source_monitor_log (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             uuid REFERENCES public.atlas_sources(id) ON DELETE CASCADE,
  checked_at            timestamptz DEFAULT now(),
  status                text,
  change_summary        text,
  requires_reingest     boolean DEFAULT false
);
GRANT SELECT ON public.atlas_source_monitor_log TO authenticated;
GRANT ALL ON public.atlas_source_monitor_log TO service_role;
ALTER TABLE public.atlas_source_monitor_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY atlas_monitor_read ON public.atlas_source_monitor_log FOR SELECT TO authenticated USING (true);
CREATE POLICY atlas_monitor_admin_write ON public.atlas_source_monitor_log FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_atlas_states_updated      BEFORE UPDATE ON public.atlas_states      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_atlas_programs_updated    BEFORE UPDATE ON public.atlas_programs    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_atlas_sources_updated     BEFORE UPDATE ON public.atlas_sources     FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_atlas_playbook_updated    BEFORE UPDATE ON public.atlas_playbook_chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_atlas_lessons_updated     BEFORE UPDATE ON public.atlas_lessons_learned   FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_atlas_ko_updated          BEFORE UPDATE ON public.atlas_knowledge_objects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- States
INSERT INTO public.atlas_states (state_code, state_name) VALUES
  ('NJ','New Jersey'), ('IN','Indiana'), ('OH','Ohio'), ('TX','Texas'),
  ('IL','Illinois'), ('PA','Pennsylvania'), ('FL','Florida'),
  ('TN','Tennessee'), ('KY','Kentucky'), ('MO','Missouri')
ON CONFLICT (state_code) DO NOTHING;

-- Programs
INSERT INTO public.atlas_programs (program_code, program_name, state_code, program_type) VALUES
  ('NJ_CSOC',     'NJ Children System of Care',          'NJ', 'behavioral_health'),
  ('NJ_MEDICAID', 'NJ FamilyCare Managed Care',          'NJ', 'managed_care'),
  ('IN_MEDICAID', 'Indiana Medicaid Managed Care',       'IN', 'managed_care'),
  ('OHIORISE',    'OhioRISE',                            'OH', 'behavioral_health'),
  ('STAR_KIDS',   'STAR Kids',                           'TX', 'managed_care'),
  ('TENNCARE',    'TennCare',                            'TN', 'managed_care')
ON CONFLICT (program_code) DO NOTHING;

-- Canon entities
INSERT INTO public.atlas_entities (slug, entity_name, entity_type, description, knowledge_layer) VALUES
  ('cms',           'Centers for Medicare and Medicaid Services',     'federal_agency', 'Federal agency governing Medicare and Medicaid.', 'canon'),
  ('macpac',        'Medicaid and CHIP Payment and Access Commission','federal_agency', 'Independent federal agency advising Congress on Medicaid.', 'canon'),
  ('medpac',        'Medicare Payment Advisory Commission',           'federal_agency', 'Independent federal agency advising Congress on Medicare.', 'canon'),
  ('samhsa',        'Substance Abuse and Mental Health Services Administration', 'federal_agency', 'Federal agency leading public health efforts to advance behavioral health.', 'canon'),
  ('wraparound',    'Wraparound',                                     'concept',        'Evidence-based care planning process centered on family strengths and youth voice.', 'canon'),
  ('family_driven', 'Family-Driven Care',                             'concept',        'Philosophy centering families as decision-makers in care planning.', 'canon'),
  ('person_first',  'Person-First Language',                          'concept',        'Language standard placing the individual before any disability or condition.', 'canon')
ON CONFLICT (slug) DO NOTHING;

-- NJ state entities
INSERT INTO public.atlas_entities (slug, entity_name, entity_type, description, knowledge_layer, state_code) VALUES
  ('njdcf',  'NJ Department of Children and Families', 'state_agency', 'NJ state agency for child welfare and behavioral health.', 'state', 'NJ'),
  ('njdhs',  'NJ Department of Human Services',        'state_agency', 'NJ state agency governing Medicaid and social services.', 'state', 'NJ'),
  ('njfamilycare', 'NJ FamilyCare',                    'program',      'NJ Medicaid and CHIP program.', 'state', 'NJ')
ON CONFLICT (slug) DO NOTHING;
