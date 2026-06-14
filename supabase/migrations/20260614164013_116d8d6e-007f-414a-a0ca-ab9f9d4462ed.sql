
-- =========================================================
-- intel_sources: ASN master registry
-- =========================================================
ALTER TABLE public.intel_sources
  ADD COLUMN IF NOT EXISTS tier integer,
  ADD COLUMN IF NOT EXISTS monitor_cadence text,
  ADD COLUMN IF NOT EXISTS signal_category text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_successful_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_content_hash text,
  ADD COLUMN IF NOT EXISTS rss_url text,
  ADD COLUMN IF NOT EXISTS scrape_url text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Allow global (registry-level) sources with no mission attached
ALTER TABLE public.intel_sources ALTER COLUMN mission_id DROP NOT NULL;

-- Widen source_type to include ASN-defined types (preserve existing values)
ALTER TABLE public.intel_sources DROP CONSTRAINT IF EXISTS intel_sources_source_type_check;
ALTER TABLE public.intel_sources ADD CONSTRAINT intel_sources_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'rfp','amendment','report','news','interview','meeting_notes','upload',
    'website','procurement_record','press_release','web_monitor',
    'rss','webpage','pdf','procurement_portal','meeting_agenda','legislative',
    'budget','advocacy','provider_association','job_posting','conference',
    'internal_debrief','manual_upload'
  ]));

ALTER TABLE public.intel_sources DROP CONSTRAINT IF EXISTS intel_sources_monitor_cadence_check;
ALTER TABLE public.intel_sources ADD CONSTRAINT intel_sources_monitor_cadence_check
  CHECK (monitor_cadence IS NULL OR monitor_cadence IN (
    'daily','weekly','monthly','mission_triggered','manual'
  ));

-- Allow RLS read of mission_id IS NULL (registry) entries for any authenticated user
DROP POLICY IF EXISTS "mission members read sources" ON public.intel_sources;
CREATE POLICY "mission members read sources"
  ON public.intel_sources FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR mission_id IS NULL
    OR is_mission_member_user(mission_id, auth.uid())
    OR is_mission_creator(mission_id, auth.uid())
  );

-- Restrict writes on registry rows (mission_id IS NULL) to admins only;
-- mission-scoped rows keep the existing membership rules.
DROP POLICY IF EXISTS "mission members write sources" ON public.intel_sources;
CREATE POLICY "mission members write sources"
  ON public.intel_sources FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      mission_id IS NOT NULL
      AND (is_mission_member_user(mission_id, auth.uid()) OR is_mission_creator(mission_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "mission members update sources" ON public.intel_sources;
CREATE POLICY "mission members update sources"
  ON public.intel_sources FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      mission_id IS NOT NULL
      AND (is_mission_member_user(mission_id, auth.uid()) OR is_mission_creator(mission_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "mission members delete sources" ON public.intel_sources;
CREATE POLICY "mission members delete sources"
  ON public.intel_sources FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      mission_id IS NOT NULL
      AND is_mission_creator(mission_id, auth.uid())
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS intel_sources_tier_idx ON public.intel_sources(tier);
CREATE INDEX IF NOT EXISTS intel_sources_monitor_cadence_idx ON public.intel_sources(monitor_cadence);
CREATE INDEX IF NOT EXISTS intel_sources_signal_category_idx ON public.intel_sources(signal_category);
CREATE INDEX IF NOT EXISTS intel_sources_is_active_idx ON public.intel_sources(is_active);

-- Idempotency for ASN seed rows (unique by notes name when registry-level)
CREATE UNIQUE INDEX IF NOT EXISTS intel_sources_asn_notes_uniq
  ON public.intel_sources(notes)
  WHERE mission_id IS NULL AND notes IS NOT NULL;

-- =========================================================
-- intel_events: ASN intake / classification layer
-- =========================================================
ALTER TABLE public.intel_events
  ADD COLUMN IF NOT EXISTS output_type text,
  ADD COLUMN IF NOT EXISTS signal_category text,
  ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES public.intel_sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_title text,
  ADD COLUMN IF NOT EXISTS source_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS relevance_score numeric,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS population text,
  ADD COLUMN IF NOT EXISTS extracted_summary text,
  ADD COLUMN IF NOT EXISTS iris_recommendation text,
  ADD COLUMN IF NOT EXISTS routing_status text DEFAULT 'unreviewed';

ALTER TABLE public.intel_events DROP CONSTRAINT IF EXISTS intel_events_output_type_check;
ALTER TABLE public.intel_events ADD CONSTRAINT intel_events_output_type_check
  CHECK (output_type IS NULL OR output_type IN (
    'signal','opportunity','risk_candidate','intel_card_candidate',
    'mission_brief_update_candidate','oracle_memory_candidate','decision_intelligence_candidate'
  ));

CREATE INDEX IF NOT EXISTS intel_events_output_type_idx ON public.intel_events(output_type);
CREATE INDEX IF NOT EXISTS intel_events_signal_category_idx ON public.intel_events(signal_category);
CREATE INDEX IF NOT EXISTS intel_events_source_id_idx ON public.intel_events(source_id);
CREATE INDEX IF NOT EXISTS intel_events_state_idx ON public.intel_events(state);
CREATE INDEX IF NOT EXISTS intel_events_routing_status_idx ON public.intel_events(routing_status);
-- mission_id index already exists (idx_intel_events_mission)

-- =========================================================
-- intel_relationships: influence network tracking
-- =========================================================
ALTER TABLE public.intel_relationships
  ADD COLUMN IF NOT EXISTS co_occurrence_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS relationship_strength numeric,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_source_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS relationship_context text;

-- =========================================================
-- oracle_decision_intelligence
-- =========================================================
CREATE TABLE IF NOT EXISTS public.oracle_decision_intelligence (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  state text,
  client_name text,
  procurement_name text,
  decision_type text CHECK (decision_type IN (
    'win','loss','protest','award','procurement_delay','procurement_cancelled',
    'contract_amendment','leadership_change','policy_shift','strategic_pivot','stakeholder_shift'
  )),
  outcome text,
  decision_summary text,
  why_it_happened text,
  signals_that_preceded_it text,
  key_influencers text,
  stakeholder_dynamics text,
  competitor_dynamics text,
  evaluator_priorities text,
  risks_that_mattered text,
  win_themes_that_landed text,
  win_themes_that_failed text,
  lessons_for_future_missions text,
  reusable_oracle_memory text,
  source_type text CHECK (source_type IN (
    'debrief','public_record','SME_interview','client_conversation',
    'market_intelligence','manual_entry','IRIS_synthesis'
  )),
  source_reference text,
  confidence_score numeric,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oracle_decision_intelligence TO authenticated;
GRANT ALL ON public.oracle_decision_intelligence TO service_role;

ALTER TABLE public.oracle_decision_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decision intel read" ON public.oracle_decision_intelligence;
CREATE POLICY "decision intel read"
  ON public.oracle_decision_intelligence FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR mission_id IS NULL
    OR is_mission_member_user(mission_id, auth.uid())
    OR is_mission_creator(mission_id, auth.uid())
  );

DROP POLICY IF EXISTS "decision intel write" ON public.oracle_decision_intelligence;
CREATE POLICY "decision intel write"
  ON public.oracle_decision_intelligence FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      mission_id IS NOT NULL
      AND (is_mission_member_user(mission_id, auth.uid()) OR is_mission_creator(mission_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "decision intel update" ON public.oracle_decision_intelligence;
CREATE POLICY "decision intel update"
  ON public.oracle_decision_intelligence FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (
      mission_id IS NOT NULL
      AND (is_mission_member_user(mission_id, auth.uid()) OR is_mission_creator(mission_id, auth.uid()))
    )
  );

DROP POLICY IF EXISTS "decision intel delete" ON public.oracle_decision_intelligence;
CREATE POLICY "decision intel delete"
  ON public.oracle_decision_intelligence FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR (mission_id IS NOT NULL AND is_mission_creator(mission_id, auth.uid()))
  );

CREATE INDEX IF NOT EXISTS oracle_decision_intel_mission_idx ON public.oracle_decision_intelligence(mission_id);
CREATE INDEX IF NOT EXISTS oracle_decision_intel_state_idx ON public.oracle_decision_intelligence(state);
CREATE INDEX IF NOT EXISTS oracle_decision_intel_decision_type_idx ON public.oracle_decision_intelligence(decision_type);

DROP TRIGGER IF EXISTS update_oracle_decision_intelligence_updated_at ON public.oracle_decision_intelligence;
CREATE TRIGGER update_oracle_decision_intelligence_updated_at
  BEFORE UPDATE ON public.oracle_decision_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- ASN starter library seed (idempotent; mission_id IS NULL)
-- 'notes' carries the canonical seed name and is the conflict key.
-- source_type defaults: rss when rss_url present, webpage when scrape_url present
-- =========================================================
INSERT INTO public.intel_sources
  (mission_id, tier, monitor_cadence, source_type, signal_category, rss_url, scrape_url, url, notes, is_active)
VALUES
  -- Tier 1
  (NULL, 1, 'daily', 'rss', 'federal_policy', 'https://www.cms.gov/newsroom/rss', NULL, 'https://www.cms.gov/newsroom/rss', 'ASN:CMS Press Releases', true),
  (NULL, 1, 'daily', 'rss', 'federal_policy', 'https://www.cms.gov/newsroom/medicaid/rss', NULL, 'https://www.cms.gov/newsroom/medicaid/rss', 'ASN:CMS Medicaid News', true),
  (NULL, 1, 'daily', 'webpage', 'federal_policy', NULL, 'https://www.medicaid.gov/federal-policy-guidance/index.html', 'https://www.medicaid.gov/federal-policy-guidance/index.html', 'ASN:Medicaid.gov Federal Policy Guidance', true),
  (NULL, 1, 'daily', 'webpage', 'waiver', NULL, 'https://www.medicaid.gov/medicaid/section-1115-demo/index.html', 'https://www.medicaid.gov/medicaid/section-1115-demo/index.html', 'ASN:Medicaid.gov State Plan Amendments', true),
  (NULL, 1, 'daily', 'webpage', 'waiver', NULL, 'https://www.medicaid.gov/medicaid/section-1115-demo/index.html', 'https://www.medicaid.gov/medicaid/section-1115-demo/index.html', 'ASN:Medicaid.gov 1115 Demonstrations', true),
  (NULL, 1, 'daily', 'webpage', 'waiver', NULL, 'https://www.medicaid.gov/medicaid/home-community-based-services/index.html', 'https://www.medicaid.gov/medicaid/home-community-based-services/index.html', 'ASN:Medicaid.gov 1915 Waivers', true),
  (NULL, 1, 'daily', 'webpage', 'federal_policy', NULL, 'https://www.medicaid.gov/medicaid/managed-care/index.html', 'https://www.medicaid.gov/medicaid/managed-care/index.html', 'ASN:Medicaid.gov Managed Care', true),
  (NULL, 1, 'daily', 'webpage', 'market_movement', NULL, 'https://www.medicaid.gov/medicaid/program-information/medicaid-and-chip-enrollment-data/index.html', 'https://www.medicaid.gov/medicaid/program-information/medicaid-and-chip-enrollment-data/index.html', 'ASN:CMS Enrollment Data', true),

  -- Tier 2
  (NULL, 2, 'weekly', 'rss', 'federal_policy', 'https://kff.org/medicaid/feed/', NULL, 'https://kff.org/medicaid/feed/', 'ASN:KFF Medicaid', true),
  (NULL, 2, 'weekly', 'webpage', 'state_policy', NULL, 'https://nashp.org', 'https://nashp.org', 'ASN:NASHP', true),
  (NULL, 2, 'weekly', 'webpage', 'federal_policy', NULL, 'https://www.macpac.gov', 'https://www.macpac.gov', 'ASN:MACPAC', true),
  (NULL, 2, 'weekly', 'webpage', 'market_movement', NULL, 'https://www.healthmanagement.com/blog/', 'https://www.healthmanagement.com/blog/', 'ASN:Health Management Associates', true),
  (NULL, 2, 'weekly', 'rss', 'market_movement', 'https://www.managedhealthcareexecutive.com/rss', NULL, 'https://www.managedhealthcareexecutive.com/rss', 'ASN:Managed Healthcare Executive', true),
  (NULL, 2, 'weekly', 'webpage', 'state_policy', NULL, 'https://ccf.georgetown.edu', 'https://ccf.georgetown.edu', 'ASN:Georgetown CCF', true),
  (NULL, 2, 'weekly', 'webpage', 'federal_policy', NULL, 'https://www.commonwealthfund.org/topics/medicaid', 'https://www.commonwealthfund.org/topics/medicaid', 'ASN:Commonwealth Fund Medicaid', true),
  (NULL, 2, 'weekly', 'webpage', 'state_policy', NULL, 'https://www.shvs.org', 'https://www.shvs.org', 'ASN:State Health and Value Strategies', true),

  -- Tier 3 (placeholders)
  (NULL, 3, 'weekly', 'legislative',          'state_policy',      NULL, NULL, NULL, 'ASN:Target State Legislative Site',       true),
  (NULL, 3, 'weekly', 'budget',               'market_movement',   NULL, NULL, NULL, 'ASN:Target State Budget Office',          true),
  (NULL, 3, 'weekly', 'procurement_portal',   'procurement',       NULL, NULL, NULL, 'ASN:MCO Contract Amendments',             true),
  (NULL, 3, 'weekly', 'webpage',              'competitor',        NULL, NULL, NULL, 'ASN:Competitor Press Releases',           true),
  (NULL, 3, 'weekly', 'provider_association', 'provider_friction', NULL, NULL, NULL, 'ASN:Provider Association Newsletters',    true),
  (NULL, 3, 'weekly', 'provider_association', 'provider_friction', NULL, NULL, NULL, 'ASN:Hospital Association Updates',        true),

  -- Tier 4
  (NULL, 4, 'mission_triggered', 'webpage',  'behavioral_health', NULL, NULL,                                              NULL,                                              'ASN:State Behavioral Health Authority', true),
  (NULL, 4, 'mission_triggered', 'webpage',  'child_welfare',     NULL, NULL,                                              NULL,                                              'ASN:State Child Welfare Agency',        true),
  (NULL, 4, 'mission_triggered', 'webpage',  'IDD',               NULL, NULL,                                              NULL,                                              'ASN:State IDD/DD Council',              true),
  (NULL, 4, 'mission_triggered', 'webpage',  'LTSS',              NULL, NULL,                                              NULL,                                              'ASN:State LTSS/Aging Agency',           true),
  (NULL, 4, 'mission_triggered', 'advocacy', 'behavioral_health', NULL, 'https://www.nami.org/Press-Media/Press-Releases', 'https://www.nami.org/Press-Media/Press-Releases', 'ASN:NAMI',                              true),
  (NULL, 4, 'mission_triggered', 'advocacy', 'IDD',               NULL, 'https://autismsociety.org/news/',                 'https://autismsociety.org/news/',                 'ASN:Autism Society',                    true),

  -- Tier 5
  (NULL, 5, 'manual', 'meeting_agenda',   'decision_intelligence', NULL, NULL, NULL, 'ASN:Medicaid Advisory Committee Agendas', true),
  (NULL, 5, 'manual', 'meeting_agenda',   'behavioral_health',     NULL, NULL, NULL, 'ASN:Behavioral Health Council Agendas',   true),
  (NULL, 5, 'manual', 'meeting_agenda',   'child_welfare',         NULL, NULL, NULL, 'ASN:Children''s Cabinet Agendas',         true),
  (NULL, 5, 'manual', 'meeting_agenda',   'decision_intelligence', NULL, NULL, NULL, 'ASN:Governor Task Force Agendas',         true),
  (NULL, 5, 'manual', 'conference',       'market_movement',       NULL, NULL, NULL, 'ASN:Conference Agendas',                  true),
  (NULL, 5, 'manual', 'job_posting',      'workforce',             NULL, NULL, NULL, 'ASN:State Medicaid Agency Job Postings',  true),
  (NULL, 5, 'manual', 'job_posting',      'competitor',            NULL, NULL, NULL, 'ASN:Competitor Job Postings',             true),
  (NULL, 5, 'manual', 'internal_debrief', 'decision_intelligence', NULL, NULL, NULL, 'ASN:Internal Debrief',                    true),
  (NULL, 5, 'manual', 'internal_debrief', 'decision_intelligence', NULL, NULL, NULL, 'ASN:SME Interview',                       true),
  (NULL, 5, 'manual', 'internal_debrief', 'decision_intelligence', NULL, NULL, NULL, 'ASN:Loss Review',                         true)
ON CONFLICT (notes) WHERE mission_id IS NULL AND notes IS NOT NULL DO NOTHING;
