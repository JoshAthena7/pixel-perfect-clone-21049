
-- =====================================================================
-- ORACLE schema consolidation (Prompt 1, recommended path)
-- =====================================================================

-- ----- ENUMS ---------------------------------------------------------
CREATE TYPE public.oracle_tier AS ENUM ('platform','state','mission');

CREATE TYPE public.oracle_category AS ENUM (
  'regulatory_federal','regulatory_state','quality_performance',
  'health_outcomes_sdoh','policy_innovation','evidence_base',
  'field_intelligence','competitive_landscape','client_content_map'
);

CREATE TYPE public.oracle_subcategory AS ENUM (
  -- regulatory_federal
  'statute','federal_regulation','federal_guidance',
  'waiver_1115','waiver_1915b','waiver_1915c','federal_policy',
  -- regulatory_state
  'state_plan','state_waiver_condition','state_regulation',
  'state_contract_requirement','state_guidance',
  -- quality_performance
  'hedis_measure','eqro_finding','nci_domain',
  'cahps_measure','state_quality_benchmark','mco_performance',
  -- health_outcomes_sdoh
  'population_health','sdoh_prevalence','health_equity_metric',
  'health_outcome_benchmark','pain_point','gap_analysis',
  -- policy_innovation
  'cmmi_model','demonstration_project','federal_grant',
  'state_grant','vbp_model','emerging_policy',
  -- evidence_base
  'peer_reviewed','federal_agency_publication','foundation_report',
  'clinical_practice_guideline','best_practice_framework','systematic_review',
  -- field_intelligence
  'advocacy_position','conference_presentation','legislative_testimony',
  'industry_association','news_media','stakeholder_communication','forum_notes',
  -- competitive_landscape
  'competitor_profile','prior_award_pattern','competitor_strength',
  'competitor_weakness','incumbent_vulnerability','differentiation_opportunity',
  -- client_content_map
  'win_theme','proof_point_category','program_description',
  'performance_highlight','content_pointer'
);

CREATE TYPE public.oracle_authority AS ENUM ('primary','secondary','tertiary','field');
CREATE TYPE public.oracle_urgency  AS ENUM ('immediate','high','normal','low','archived');
CREATE TYPE public.oracle_source_type AS ENUM ('rss_feed','html_scrape','api','manual_only');
CREATE TYPE public.oracle_source_status AS ENUM ('active','paused','error','deprecated');
CREATE TYPE public.oracle_ingestion_status AS ENUM ('pending','classifying','classified','dismissed','error');

-- ----- EXTEND oracle_signals ----------------------------------------
-- Allow null mission_id for platform/state tier rows
ALTER TABLE public.oracle_signals ALTER COLUMN mission_id DROP NOT NULL;

ALTER TABLE public.oracle_signals
  ADD COLUMN tier              public.oracle_tier        NOT NULL DEFAULT 'mission',
  ADD COLUMN category          public.oracle_category    NULL,
  ADD COLUMN subcategory       public.oracle_subcategory NULL,
  ADD COLUMN authority         public.oracle_authority   NOT NULL DEFAULT 'tertiary',
  ADD COLUMN urgency           public.oracle_urgency     NOT NULL DEFAULT 'normal',
  ADD COLUMN summary           text,
  ADD COLUMN source_name       text,
  ADD COLUMN metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN authority_weight  integer     NOT NULL DEFAULT 50
    CHECK (authority_weight BETWEEN 0 AND 100),
  ADD COLUMN topic_tags          text[]    NOT NULL DEFAULT '{}',
  ADD COLUMN win_theme_tags      text[]    NOT NULL DEFAULT '{}',
  ADD COLUMN jpb_variable_tags   text[]    NOT NULL DEFAULT '{}',
  ADD COLUMN question_type_tags  text[]    NOT NULL DEFAULT '{}',
  ADD COLUMN published_at        timestamptz NULL,
  ADD COLUMN effective_date      date NULL,
  ADD COLUMN expiration_date     date NULL,
  ADD COLUMN is_superseded       boolean NOT NULL DEFAULT false,
  ADD COLUMN superseded_by       uuid NULL REFERENCES public.oracle_signals(id) ON DELETE SET NULL,
  ADD COLUMN ingestion_source    text NOT NULL DEFAULT 'manual',
  ADD COLUMN last_verified_at    timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN archived_at         timestamptz NULL,
  ADD COLUMN archived_reason     text NULL;

-- Keep scope_tier in sync with new tier column on writes (one-time backfill + ongoing trigger)
UPDATE public.oracle_signals SET tier = scope_tier::public.oracle_tier WHERE scope_tier IS NOT NULL;

CREATE OR REPLACE FUNCTION public.oracle_signals_sync_tier()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier OR TG_OP = 'INSERT' THEN
    NEW.scope_tier := NEW.tier::text;
  ELSIF NEW.scope_tier IS DISTINCT FROM OLD.scope_tier THEN
    NEW.tier := NEW.scope_tier::public.oracle_tier;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_oracle_signals_sync_tier
  BEFORE INSERT OR UPDATE ON public.oracle_signals
  FOR EACH ROW EXECUTE FUNCTION public.oracle_signals_sync_tier();

-- GIN indexes for tag arrays + filter indexes
CREATE INDEX idx_oracle_signals_topic_tags        ON public.oracle_signals USING GIN(topic_tags);
CREATE INDEX idx_oracle_signals_win_theme_tags    ON public.oracle_signals USING GIN(win_theme_tags);
CREATE INDEX idx_oracle_signals_jpb_tags          ON public.oracle_signals USING GIN(jpb_variable_tags);
CREATE INDEX idx_oracle_signals_qtype_tags        ON public.oracle_signals USING GIN(question_type_tags);
CREATE INDEX idx_oracle_signals_tier              ON public.oracle_signals(tier);
CREATE INDEX idx_oracle_signals_category          ON public.oracle_signals(category);
CREATE INDEX idx_oracle_signals_subcategory       ON public.oracle_signals(subcategory);
CREATE INDEX idx_oracle_signals_urgency           ON public.oracle_signals(urgency);
CREATE INDEX idx_oracle_signals_published         ON public.oracle_signals(published_at DESC);

-- Tier-aware RLS additions (don't drop existing policies)
CREATE POLICY "oracle_signals_platform_read"
  ON public.oracle_signals FOR SELECT TO authenticated
  USING (tier = 'platform' AND archived_at IS NULL);

CREATE POLICY "oracle_signals_state_read"
  ON public.oracle_signals FOR SELECT TO authenticated
  USING (tier = 'state' AND archived_at IS NULL);

CREATE POLICY "oracle_signals_mission_tier_read"
  ON public.oracle_signals FOR SELECT TO authenticated
  USING (
    tier = 'mission'
    AND archived_at IS NULL
    AND mission_id IS NOT NULL
    AND public.is_mission_team_member(mission_id, auth.uid())
  );

CREATE POLICY "oracle_signals_admin_all"
  ON public.oracle_signals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ----- EXTEND question_intel_links ----------------------------------
ALTER TABLE public.question_intel_links
  ADD COLUMN briefing_layer text NULL,
  ADD COLUMN display_order  integer NOT NULL DEFAULT 0,
  ADD COLUMN is_critical    boolean NOT NULL DEFAULT false,
  ADD COLUMN is_suppressed  boolean NOT NULL DEFAULT false;

ALTER TABLE public.question_intel_links
  ADD CONSTRAINT qil_briefing_layer_chk
  CHECK (briefing_layer IS NULL OR briefing_layer IN
    ('regulatory','compliance','evidence','environmental','win_theme','content_map'));

CREATE INDEX idx_qil_briefing_layer ON public.question_intel_links(briefing_layer);
CREATE INDEX idx_qil_critical       ON public.question_intel_links(is_critical) WHERE is_critical;

CREATE POLICY "qil_member_read_team_member"
  ON public.question_intel_links FOR SELECT TO authenticated
  USING (public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "qil_admin_all"
  ON public.question_intel_links FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ====================================================================
-- NEW: oracle_source_registry
-- ====================================================================
CREATE TABLE public.oracle_source_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier public.oracle_tier NOT NULL,
  state_code char(2) NULL,
  mission_id uuid NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_url  text NOT NULL,
  feed_url    text NULL,
  source_type public.oracle_source_type NOT NULL DEFAULT 'html_scrape',
  default_category    public.oracle_category    NOT NULL,
  default_subcategory public.oracle_subcategory NOT NULL,
  default_authority   public.oracle_authority   NOT NULL DEFAULT 'secondary',
  check_frequency_hours integer NOT NULL DEFAULT 4,
  last_checked_at  timestamptz NULL,
  last_new_item_at timestamptz NULL,
  status public.oracle_source_status NOT NULL DEFAULT 'active',
  error_message text NULL,
  error_count integer NOT NULL DEFAULT 0,
  minimum_relevance_threshold integer NOT NULL DEFAULT 40,
  topic_filter_tags text[] NOT NULL DEFAULT '{}',
  description text NULL,
  notes text NULL,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_osr_tier   ON public.oracle_source_registry(tier);
CREATE INDEX idx_osr_state  ON public.oracle_source_registry(state_code);
CREATE INDEX idx_osr_status ON public.oracle_source_registry(status) WHERE status='active';
CREATE INDEX idx_osr_check  ON public.oracle_source_registry(last_checked_at, check_frequency_hours);

GRANT SELECT ON public.oracle_source_registry TO authenticated;
GRANT ALL    ON public.oracle_source_registry TO service_role;

ALTER TABLE public.oracle_source_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "osr_authenticated_read"
  ON public.oracle_source_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "osr_admin_all"
  ON public.oracle_source_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_osr_updated_at
  BEFORE UPDATE ON public.oracle_source_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: 10 platform + 4 NJ sources
INSERT INTO public.oracle_source_registry
  (tier, source_name, source_url, source_type, default_category, default_subcategory, default_authority, check_frequency_hours, description)
VALUES
  ('platform','CMS Medicaid.gov News','https://www.medicaid.gov/about-us/news-alerts/index.html','html_scrape','regulatory_federal','federal_guidance','secondary',6,'CMS Medicaid program news and alerts'),
  ('platform','Federal Register - Medicaid','https://www.federalregister.gov/documents/search?conditions%5Bagencies%5D%5B%5D=centers-for-medicare-medicaid-services','html_scrape','regulatory_federal','federal_regulation','primary',12,'Federal Register CMS Medicaid rules and proposed rules'),
  ('platform','MACPAC Reports','https://www.macpac.gov/publications/','html_scrape','regulatory_federal','federal_guidance','secondary',24,'Medicaid and CHIP Payment and Access Commission reports'),
  ('platform','SAMHSA News','https://www.samhsa.gov/newsroom','html_scrape','evidence_base','federal_agency_publication','secondary',12,'SAMHSA behavioral health publications and guidance'),
  ('platform','CMMI Innovation Models','https://innovation.cms.gov/innovation-models','html_scrape','policy_innovation','cmmi_model','secondary',24,'CMS Innovation Center active models'),
  ('platform','Kaiser Family Foundation - Medicaid','https://www.kff.org/medicaid/','html_scrape','field_intelligence','news_media','tertiary',6,'KFF Medicaid research and analysis'),
  ('platform','Health Affairs','https://www.healthaffairs.org/topic/medicaid','html_scrape','evidence_base','peer_reviewed','secondary',24,'Health Affairs Medicaid policy research'),
  ('platform','Annie E. Casey Foundation','https://www.aecf.org/topics/child-welfare','html_scrape','evidence_base','foundation_report','tertiary',48,'Child welfare and youth development research'),
  ('platform','Commonwealth Fund','https://www.commonwealthfund.org/topics/medicaid','html_scrape','evidence_base','foundation_report','tertiary',48,'Health system performance research'),
  ('platform','NCTSN Publications','https://www.nctsn.org/resources','html_scrape','evidence_base','clinical_practice_guideline','secondary',48,'National Child Traumatic Stress Network clinical resources');

INSERT INTO public.oracle_source_registry
  (tier, state_code, source_name, source_url, source_type, default_category, default_subcategory, default_authority, check_frequency_hours, description)
VALUES
  ('state','NJ','NJ DMAHS Medicaid','https://www.state.nj.us/humanservices/dmahs/home/','html_scrape','regulatory_state','state_guidance','secondary',6,'NJ Division of Medical Assistance and Health Services'),
  ('state','NJ','NJ DCF Publications','https://www.nj.gov/dcf/news/publications/','html_scrape','regulatory_state','state_guidance','secondary',12,'NJ Department of Children and Families publications'),
  ('state','NJ','NJSTART Procurement','https://www.njstart.gov/','html_scrape','field_intelligence','stakeholder_communication','primary',4,'NJ procurement portal for RFP amendments and Q&A'),
  ('state','NJ','NJ Legislature','https://www.njleg.state.nj.us/','html_scrape','policy_innovation','emerging_policy','primary',24,'NJ legislative activity relevant to health and human services');

-- ====================================================================
-- NEW: oracle_quality_measures
-- ====================================================================
CREATE TABLE public.oracle_quality_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code char(2) NOT NULL,
  mission_id uuid NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  measurement_year integer NOT NULL,
  measure_set text NOT NULL,
  measure_code text NOT NULL,
  measure_name text NOT NULL,
  measure_domain text NULL,
  measure_description text NULL,
  national_medicaid_benchmark numeric(5,2) NULL,
  state_benchmark numeric(5,2) NULL,
  state_current_rate numeric(5,2) NULL,
  mco_rate numeric(5,2) NULL,
  mco_benchmark_comparison text NULL,
  national_percentile integer NULL,
  prior_year_state_rate numeric(5,2) NULL,
  trend_direction text NULL,
  relevance_to_mission text NULL,
  competitive_significance text NULL,
  oracle_node_id uuid NULL REFERENCES public.oracle_signals(id) ON DELETE SET NULL,
  source_document text NULL,
  source_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_quality_measures
  ON public.oracle_quality_measures(state_code, measure_set, measure_code, measurement_year, COALESCE(mission_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX idx_qm_state   ON public.oracle_quality_measures(state_code);
CREATE INDEX idx_qm_mission ON public.oracle_quality_measures(mission_id);
CREATE INDEX idx_qm_set     ON public.oracle_quality_measures(measure_set);
CREATE INDEX idx_qm_year    ON public.oracle_quality_measures(measurement_year DESC);

GRANT SELECT ON public.oracle_quality_measures TO authenticated;
GRANT ALL    ON public.oracle_quality_measures TO service_role;

ALTER TABLE public.oracle_quality_measures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qm_authenticated_read"
  ON public.oracle_quality_measures FOR SELECT TO authenticated USING (true);
CREATE POLICY "qm_admin_all"
  ON public.oracle_quality_measures FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_qm_updated_at
  BEFORE UPDATE ON public.oracle_quality_measures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ====================================================================
-- NEW: oracle_sdoh_data
-- ====================================================================
CREATE TABLE public.oracle_sdoh_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code char(2) NOT NULL,
  mission_id uuid NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  geography_type text NOT NULL,
  geography_name text NOT NULL,
  geography_fips text NULL,
  sdoh_domain text NOT NULL,
  sdoh_measure text NOT NULL,
  prevalence_rate numeric(5,2) NULL,
  national_benchmark numeric(5,2) NULL,
  state_benchmark numeric(5,2) NULL,
  data_year integer NOT NULL,
  population_affected integer NULL,
  medicaid_population_rate numeric(5,2) NULL,
  trend_direction text NULL,
  priority_level text NULL,
  data_source text NOT NULL,
  source_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sdoh_state     ON public.oracle_sdoh_data(state_code);
CREATE INDEX idx_sdoh_mission   ON public.oracle_sdoh_data(mission_id);
CREATE INDEX idx_sdoh_domain    ON public.oracle_sdoh_data(sdoh_domain);
CREATE INDEX idx_sdoh_geo       ON public.oracle_sdoh_data(geography_type, geography_name);
CREATE INDEX idx_sdoh_priority  ON public.oracle_sdoh_data(priority_level);

GRANT SELECT ON public.oracle_sdoh_data TO authenticated;
GRANT ALL    ON public.oracle_sdoh_data TO service_role;

ALTER TABLE public.oracle_sdoh_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sdoh_authenticated_read"
  ON public.oracle_sdoh_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "sdoh_admin_all"
  ON public.oracle_sdoh_data FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_sdoh_updated_at
  BEFORE UPDATE ON public.oracle_sdoh_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ====================================================================
-- NEW: oracle_ingestion_queue
-- ====================================================================
CREATE TABLE public.oracle_ingestion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oracle_source_id uuid NULL REFERENCES public.oracle_source_registry(id) ON DELETE SET NULL,
  source_url text NOT NULL,
  source_name text NOT NULL,
  raw_title text NOT NULL,
  raw_text  text NOT NULL,
  raw_published_at timestamptz NULL,
  status public.oracle_ingestion_status NOT NULL DEFAULT 'pending',
  classified_category    public.oracle_category    NULL,
  classified_subcategory public.oracle_subcategory NULL,
  classified_relevance_score integer NULL,
  classified_urgency public.oracle_urgency NULL,
  classified_summary text NULL,
  classified_topic_tags text[] NULL,
  classified_win_theme_tags text[] NULL,
  classification_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  classified_at timestamptz NULL,
  promoted_node_id uuid NULL REFERENCES public.oracle_signals(id) ON DELETE SET NULL,
  promoted_at timestamptz NULL,
  error_message text NULL,
  retry_count integer NOT NULL DEFAULT 0,
  tier public.oracle_tier NULL,
  state_code char(2) NULL,
  mission_id uuid NULL REFERENCES public.missions(id) ON DELETE SET NULL,
  ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oiq_status    ON public.oracle_ingestion_queue(status);
CREATE INDEX idx_oiq_pending   ON public.oracle_ingestion_queue(status, ingested_at) WHERE status='pending';
CREATE INDEX idx_oiq_source    ON public.oracle_ingestion_queue(oracle_source_id);
CREATE INDEX idx_oiq_relevance ON public.oracle_ingestion_queue(classified_relevance_score DESC) WHERE classified_relevance_score IS NOT NULL;

GRANT ALL ON public.oracle_ingestion_queue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oracle_ingestion_queue TO authenticated;

ALTER TABLE public.oracle_ingestion_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oiq_admin_all"
  ON public.oracle_ingestion_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
