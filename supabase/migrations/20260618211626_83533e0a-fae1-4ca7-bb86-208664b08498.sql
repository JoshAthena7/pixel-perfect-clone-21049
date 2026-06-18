
-- =====================================================================
-- ORACLE TAXONOMY: authoritative intelligence classification tree
-- =====================================================================

CREATE TABLE public.oracle_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.oracle_taxonomy(id) ON DELETE CASCADE,
  domain text NOT NULL,
  node_name text NOT NULL,
  node_code text NOT NULL UNIQUE,
  depth integer NOT NULL,
  is_leaf boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oracle_taxonomy_domain_chk CHECK (domain IN (
    'REGULATORY_AUTHORITY','QUALITY_PERFORMANCE','HEALTH_OUTCOMES_SDOH',
    'POLICY_INNOVATION','EVIDENCE_BASE','FIELD_INTELLIGENCE',
    'COMPETITIVE_LANDSCAPE','CLIENT_CONTENT_MAP'
  )),
  CONSTRAINT oracle_taxonomy_depth_chk CHECK (depth BETWEEN 0 AND 3)
);

CREATE INDEX idx_oracle_taxonomy_parent ON public.oracle_taxonomy(parent_id);
CREATE INDEX idx_oracle_taxonomy_domain ON public.oracle_taxonomy(domain);
CREATE INDEX idx_oracle_taxonomy_code ON public.oracle_taxonomy(node_code);

GRANT SELECT ON public.oracle_taxonomy TO authenticated;
GRANT ALL ON public.oracle_taxonomy TO service_role;

ALTER TABLE public.oracle_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oracle_taxonomy_read_all"
  ON public.oracle_taxonomy FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "oracle_taxonomy_admin_write"
  ON public.oracle_taxonomy FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_oracle_taxonomy_updated_at
  BEFORE UPDATE ON public.oracle_taxonomy
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- Seed: complete taxonomy tree
-- ---------------------------------------------------------------------
-- Helper inserts use deterministic node_codes so children can resolve parents.

-- Domain roots (depth 0)
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf) VALUES
  (NULL, 'REGULATORY_AUTHORITY', 'Regulatory Authority', 'REG', 0, false),
  (NULL, 'QUALITY_PERFORMANCE',  'Quality & Performance', 'QP',  0, false),
  (NULL, 'HEALTH_OUTCOMES_SDOH', 'Health Outcomes & SDOH', 'HO', 0, false),
  (NULL, 'POLICY_INNOVATION',    'Policy Innovation', 'PI',     0, false),
  (NULL, 'EVIDENCE_BASE',        'Evidence Base', 'EV',         0, false),
  (NULL, 'FIELD_INTELLIGENCE',   'Field Intelligence', 'FI',    0, false),
  (NULL, 'COMPETITIVE_LANDSCAPE','Competitive Landscape', 'CL', 0, false),
  (NULL, 'CLIENT_CONTENT_MAP',   'Client Content Map', 'CC',    0, false);

-- ====== REGULATORY_AUTHORITY ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'REGULATORY_AUTHORITY', 'Federal (CMS, SAMHSA, HHS)', 'REG_FED', 1, false FROM public.oracle_taxonomy WHERE node_code='REG';
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'REGULATORY_AUTHORITY', 'State', 'REG_STATE', 1, false FROM public.oracle_taxonomy WHERE node_code='REG';

INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'REGULATORY_AUTHORITY', n, c, 2, true FROM public.oracle_taxonomy, (VALUES
  ('Statute (Title XIX, Title XXI)', 'REG_FED_STATUTE'),
  ('Regulation (42 CFR parts)',      'REG_FED_REGULATION'),
  ('Guidance (informational bulletins, SMD letters)', 'REG_FED_GUIDANCE'),
  ('Waiver (1115, 1915b, 1915c)',    'REG_FED_WAIVER'),
  ('Policy (state plan requirements)', 'REG_FED_POLICY')
) v(n,c) WHERE node_code='REG_FED';

INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'REGULATORY_AUTHORITY', n, c, 2, true FROM public.oracle_taxonomy, (VALUES
  ('State Plan (base + amendments)', 'REG_STATE_PLAN'),
  ('Waiver conditions',              'REG_STATE_WAIVER'),
  ('State regulation (N.J.A.C.)',    'REG_STATE_REGULATION'),
  ('Contract requirements',          'REG_STATE_CONTRACT')
) v(n,c) WHERE node_code='REG_STATE';

-- ====== QUALITY_PERFORMANCE ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'QUALITY_PERFORMANCE', n, c, 1, true FROM public.oracle_taxonomy, (VALUES
  ('HEDIS measures',              'QP_HEDIS'),
  ('CAHPS survey results',        'QP_CAHPS'),
  ('NCQA accreditation',          'QP_NCQA'),
  ('CMS Star Ratings',            'QP_STARS'),
  ('Quality Withhold / P4P programs', 'QP_P4P'),
  ('Encounter data quality',      'QP_ENCOUNTER'),
  ('Performance Improvement Projects (PIPs)', 'QP_PIP'),
  ('External Quality Review (EQR)', 'QP_EQR')
) v(n,c) WHERE node_code='QP';

-- ====== HEALTH_OUTCOMES_SDOH ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'HEALTH_OUTCOMES_SDOH', n, c, 1, true FROM public.oracle_taxonomy, (VALUES
  ('Clinical outcomes (chronic disease, maternal, BH)', 'HO_CLINICAL'),
  ('Health disparities & equity metrics', 'HO_EQUITY'),
  ('Social Determinants screening & referral', 'HO_SDOH_SCREENING'),
  ('Housing & food security interventions', 'HO_HOUSING_FOOD'),
  ('Behavioral health integration', 'HO_BH_INTEGRATION'),
  ('Population health management',  'HO_POP_HEALTH'),
  ('Community health worker programs', 'HO_CHW')
) v(n,c) WHERE node_code='HO';

-- ====== POLICY_INNOVATION ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'POLICY_INNOVATION', n, c, 1, true FROM public.oracle_taxonomy, (VALUES
  ('Value-based payment models',  'PI_VBP'),
  ('Alternative payment models (APM)', 'PI_APM'),
  ('Care delivery transformation', 'PI_CARE_TRANSFORM'),
  ('Integrated care models',       'PI_INTEGRATED'),
  ('1115 demonstration innovations', 'PI_1115_INNOVATION'),
  ('Cross-sector partnerships',    'PI_PARTNERSHIPS'),
  ('Technology & digital health pilots', 'PI_DIGITAL')
) v(n,c) WHERE node_code='PI';

-- ====== EVIDENCE_BASE ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'EVIDENCE_BASE', n, c, 1, true FROM public.oracle_taxonomy, (VALUES
  ('Peer-reviewed research',      'EV_RESEARCH'),
  ('Systematic reviews & meta-analyses', 'EV_SYSREVIEW'),
  ('Clinical practice guidelines', 'EV_GUIDELINES'),
  ('Evidence-based program registries', 'EV_REGISTRIES'),
  ('Best practice case studies',   'EV_CASES'),
  ('Federal evaluation reports',   'EV_FED_EVAL'),
  ('Foundation reports (RWJF, Commonwealth, KFF)', 'EV_FOUNDATION')
) v(n,c) WHERE node_code='EV';

-- ====== FIELD_INTELLIGENCE ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'FIELD_INTELLIGENCE', n, c, 1, true FROM public.oracle_taxonomy, (VALUES
  ('SME interviews & debriefs',    'FI_SME'),
  ('State agency relationships',   'FI_STATE_RELATIONSHIPS'),
  ('Provider network intelligence','FI_PROVIDER'),
  ('Member & advocate feedback',   'FI_MEMBER'),
  ('Conference & event intelligence', 'FI_EVENTS'),
  ('Vendor & subcontractor scuttlebutt', 'FI_VENDOR'),
  ('Political climate signals',    'FI_POLITICAL')
) v(n,c) WHERE node_code='FI';

-- ====== COMPETITIVE_LANDSCAPE ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'COMPETITIVE_LANDSCAPE', n, c, 1, true FROM public.oracle_taxonomy, (VALUES
  ('Incumbent performance profile','CL_INCUMBENT'),
  ('Competitor capabilities matrix','CL_CAPABILITIES'),
  ('Past win/loss intelligence',    'CL_WINLOSS'),
  ('Competitor staffing & key personnel', 'CL_STAFFING'),
  ('Pricing & rate intelligence',   'CL_PRICING'),
  ('Competitor weaknesses & ghosting opportunities', 'CL_WEAKNESSES'),
  ('M&A and market share shifts',   'CL_MARKET_SHIFTS')
) v(n,c) WHERE node_code='CL';

-- ====== CLIENT_CONTENT_MAP ======
INSERT INTO public.oracle_taxonomy (parent_id, domain, node_name, node_code, depth, is_leaf)
SELECT id, 'CLIENT_CONTENT_MAP', n, c, 1, true FROM public.oracle_taxonomy, (VALUES
  ('Win themes (strategic narrative per theme)', 'CC_WIN_THEMES'),
  ('Proof point categories (by topic)',          'CC_PROOF_POINTS'),
  ('Program descriptions (high level)',          'CC_PROGRAMS'),
  ('Performance highlights (benchmark level)',   'CC_PERFORMANCE'),
  ('Where to find details (pointer to client environment)', 'CC_POINTERS')
) v(n,c) WHERE node_code='CC';

-- =====================================================================
-- ORACLE_SIGNALS: add taxonomy_node_ids + scope columns
-- (oracle_signals is the canonical intel record; user's spec used "oracle_nodes")
-- =====================================================================

ALTER TABLE public.oracle_signals
  ADD COLUMN IF NOT EXISTS taxonomy_node_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope_tier text NOT NULL DEFAULT 'mission',
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.oracle_signals
  DROP CONSTRAINT IF EXISTS oracle_signals_scope_tier_chk;
ALTER TABLE public.oracle_signals
  ADD CONSTRAINT oracle_signals_scope_tier_chk
  CHECK (scope_tier IN ('platform','state','mission'));

CREATE INDEX IF NOT EXISTS idx_oracle_signals_taxonomy
  ON public.oracle_signals USING GIN (taxonomy_node_ids);
CREATE INDEX IF NOT EXISTS idx_oracle_signals_scope
  ON public.oracle_signals (scope_tier, state_code);

-- =====================================================================
-- QUERY FUNCTION: query_oracle
-- =====================================================================

CREATE OR REPLACE FUNCTION public.query_oracle(
  p_mission_id uuid,
  p_question_id uuid,
  p_taxonomy_codes text[],
  p_limit_per_branch int DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_code text;
  v_result jsonb := '[]'::jsonb;
  v_branch record;
BEGIN
  -- Resolve mission state for state-tier scoping
  SELECT state_code INTO v_state_code FROM public.missions WHERE id = p_mission_id;

  FOR v_branch IN
    SELECT id AS taxonomy_id, node_code, node_name, domain
    FROM public.oracle_taxonomy
    WHERE node_code = ANY(p_taxonomy_codes)
  LOOP
    v_result := v_result || jsonb_build_object(
      'taxonomy_code', v_branch.node_code,
      'taxonomy_name', v_branch.node_name,
      'domain', v_branch.domain,
      'results', COALESCE((
        SELECT jsonb_agg(row_to_json(r) ORDER BY r.boosted_score DESC)
        FROM (
          SELECT
            s.id,
            s.title,
            s.signal_type,
            s.what_happened,
            s.why_it_matters,
            s.recommended_action,
            s.oracle_score,
            s.scope_tier,
            s.state_code,
            (s.oracle_score + COALESCE(qil.relevance_score, 0) * 0.5)::int AS boosted_score,
            qil.relevance_explanation,
            qil.confirmed AS linked_to_question
          FROM public.oracle_signals s
          LEFT JOIN public.question_intel_links qil
            ON qil.signal_id = s.id AND qil.question_id = p_question_id
          WHERE v_branch.taxonomy_id = ANY(s.taxonomy_node_ids)
            AND s.status IN ('approved','pushed','needs_review')
            AND (
              s.scope_tier = 'platform'
              OR (s.scope_tier = 'state' AND s.state_code = v_state_code)
              OR (s.scope_tier = 'mission' AND s.mission_id = p_mission_id)
            )
          ORDER BY boosted_score DESC
          LIMIT p_limit_per_branch
        ) r
      ), '[]'::jsonb)
    );
  END LOOP;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.query_oracle(uuid, uuid, text[], int) TO authenticated, service_role;
