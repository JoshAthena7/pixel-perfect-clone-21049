
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Extend engagements
ALTER TABLE public.engagements
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS engagement_type text,
  ADD COLUMN IF NOT EXISTS contract_value_estimate numeric;

-- 2. engagement_config
CREATE TABLE IF NOT EXISTS public.engagement_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL UNIQUE,
  incumbent text,
  competitors text[] NOT NULL DEFAULT '{}',
  evaluation_criteria text[] NOT NULL DEFAULT '{}',
  key_differentiators text[] NOT NULL DEFAULT '{}',
  local_requirements text,
  state_specific_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_config TO authenticated;
GRANT ALL ON public.engagement_config TO service_role;

ALTER TABLE public.engagement_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY engagement_config_select_member ON public.engagement_config
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY engagement_config_insert_leadership ON public.engagement_config
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY engagement_config_update_leadership ON public.engagement_config
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY engagement_config_delete_leadership ON public.engagement_config
  FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm']));

DROP TRIGGER IF EXISTS trg_engagement_config_updated_at ON public.engagement_config;
CREATE TRIGGER trg_engagement_config_updated_at
  BEFORE UPDATE ON public.engagement_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.seed_engagement_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.engagement_config (engagement_id)
  VALUES (NEW.id)
  ON CONFLICT (engagement_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_engagement_config ON public.engagements;
CREATE TRIGGER trg_seed_engagement_config
  AFTER INSERT ON public.engagements
  FOR EACH ROW EXECUTE FUNCTION public.seed_engagement_config();

-- 3. state_resources
CREATE TABLE IF NOT EXISTS public.state_resources (
  state text PRIMARY KEY,
  state_name text NOT NULL,
  procurement_portal_url text,
  small_business_program text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.state_resources TO authenticated, anon;
GRANT ALL ON public.state_resources TO service_role;

ALTER TABLE public.state_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY state_resources_select_all ON public.state_resources
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.state_resources (state, state_name, procurement_portal_url, small_business_program) VALUES
('AL','Alabama','https://procurement.alabama.gov','Alabama Small Business Office'),
('AK','Alaska','https://doa.alaska.gov/dgs','Alaska Small Business Development Center'),
('AZ','Arizona','https://spo.az.gov','Arizona Procurement Technical Assistance Center'),
('AR','Arkansas','https://www.transform.ar.gov/procurement','Arkansas Small Business Office'),
('CA','California','https://caleprocure.ca.gov','California SB/DVBE Services'),
('CO','Colorado','https://www.colorado.gov/pacific/osc/procurement','Colorado OEDIT Minority Business Office'),
('CT','Connecticut','https://portal.ct.gov/DAS/Procurement','CT DAS Supplier Diversity'),
('DE','Delaware','https://bids.delaware.gov','Delaware Office of Supplier Diversity'),
('FL','Florida','https://www.myfloridamarketplace.com','Florida Office of Supplier Diversity'),
('GA','Georgia','https://doas.ga.gov/state-purchasing','Georgia Mentor-Protege Connection'),
('HI','Hawaii','https://spo.hawaii.gov','Hawaii Office of Procurement & Contracts'),
('ID','Idaho','https://purchasing.idaho.gov','Idaho Division of Purchasing'),
('IL','Illinois','https://www2.illinois.gov/cms/business','Illinois BEP'),
('IN','Indiana','https://www.in.gov/idoa/procurement','Indiana MWBE Division'),
('IA','Iowa','https://das.iowa.gov/procurement','Iowa Targeted Small Business'),
('KS','Kansas','https://admin.ks.gov/offices/procurement-and-contracts','Kansas Office of Minority & Women Business'),
('KY','Kentucky','https://finance.ky.gov/services/eprocurement','Kentucky Minority Business Enterprise'),
('LA','Louisiana','https://wwwcfprd.doa.louisiana.gov/osp','Louisiana Hudson Initiative'),
('ME','Maine','https://www.maine.gov/dafs/bbm/procurementservices','Maine Procurement Services'),
('MD','Maryland','https://emaryland.buyspeed.com','Maryland MBE Program'),
('MA','Massachusetts','https://www.commbuys.com','Massachusetts SDO Program'),
('MI','Michigan','https://www.michigan.gov/procurement','Michigan Procurement Technical Assistance'),
('MN','Minnesota','https://mn.gov/admin/business','Minnesota TG/ED/VO Certification'),
('MS','Mississippi','https://www.dfa.ms.gov/dfa-offices/purchasing-travel-and-fleet-management','Mississippi Minority Business Enterprise'),
('MO','Missouri','https://oa.mo.gov/purchasing','Missouri MBE/WBE Certification'),
('MT','Montana','https://gsd.mt.gov/StateProcurement','Montana State Procurement Bureau'),
('NE','Nebraska','https://das.nebraska.gov/materiel/purchasing','Nebraska State Purchasing Bureau'),
('NV','Nevada','https://purchasing.nv.gov','Nevada Purchasing Division'),
('NH','New Hampshire','https://www.das.nh.gov/purchasing','NH Bureau of Purchase and Property'),
('NJ','New Jersey','https://www.nj.gov/treasury/purchase','New Jersey SBE/MBE/WBE Program'),
('NM','New Mexico','https://www.generalservices.state.nm.us/statepurchasing','New Mexico State Purchasing Division'),
('NY','New York','https://ogs.ny.gov/procurement','New York MWBE Certification'),
('NC','North Carolina','https://www.nc.gov/services/find-bids-rfps-and-government-contracts','North Carolina HUB Office'),
('ND','North Dakota','https://www.nd.gov/omb/agency/procurement','North Dakota Office of Management & Budget'),
('OH','Ohio','https://procure.ohio.gov','Ohio MBE/EDGE Certification'),
('OK','Oklahoma','https://oklahoma.gov/omes/services/purchasing','Oklahoma Central Purchasing Division'),
('OR','Oregon','https://www.oregon.gov/das/Procurement','Oregon COBID Certification'),
('PA','Pennsylvania','https://www.budget.pa.gov/Services/ForVendors','Pennsylvania Small Diverse Business Program'),
('RI','Rhode Island','https://www.ridop.ri.gov','Rhode Island MBE Office'),
('SC','South Carolina','https://procurement.sc.gov','South Carolina MBE Office'),
('SD','South Dakota','https://bfm.sd.gov/bidopps','South Dakota State Procurement Office'),
('TN','Tennessee','https://www.tn.gov/generalservices/procurement','Tennessee Office of Diversity Business Enterprise'),
('TX','Texas','https://comptroller.texas.gov/purchasing','Texas HUB Program'),
('UT','Utah','https://purchasing.utah.gov','Utah Division of Purchasing'),
('VT','Vermont','https://bgs.vermont.gov/purchasing-contracting','Vermont Office of Purchasing & Contracting'),
('VA','Virginia','https://eva.virginia.gov','Virginia SWaM Certification'),
('WA','Washington','https://des.wa.gov/services/contracting-purchasing','Washington OMWBE Certification'),
('WV','West Virginia','https://www.state.wv.us/admin/purchase','West Virginia Purchasing Division'),
('WI','Wisconsin','https://doa.wi.gov/Pages/DoingBusiness/Procurement.aspx','Wisconsin Supplier Diversity Program'),
('WY','Wyoming','https://ai.wyo.gov/divisions/general-services/procurement','Wyoming General Services Division'),
('DC','District of Columbia','https://ocp.dc.gov','DC CBE Certification')
ON CONFLICT (state) DO NOTHING;

-- 4. state_trivia_bank
CREATE TABLE IF NOT EXISTS public.state_trivia_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  question text NOT NULL,
  choices text[] NOT NULL,
  correct_index int NOT NULL,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.state_trivia_bank TO authenticated, anon;
GRANT ALL ON public.state_trivia_bank TO service_role;

ALTER TABLE public.state_trivia_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY state_trivia_select_all ON public.state_trivia_bank
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_state_trivia_state ON public.state_trivia_bank(state);

INSERT INTO public.state_trivia_bank (state, question, choices, correct_index, explanation) VALUES
('CA', 'What share of California Medi-Cal enrollees are in managed care?', ARRAY['~50%','~70%','~85%','~95%'], 2, '~85% of Medi-Cal beneficiaries are enrolled in managed care plans.'),
('CA', 'Which agency administers Medi-Cal?', ARRAY['DHCS','CDPH','CalHHS','DMHC'], 0, 'The Department of Health Care Services (DHCS) administers Medi-Cal.'),
('TX', 'How many MCOs operate STAR+PLUS in Texas?', ARRAY['3','5','6','8'], 1, 'Five MCOs operate STAR+PLUS statewide.'),
('TX', 'Which Texas Medicaid program serves elderly/disabled adults?', ARRAY['STAR','STAR Kids','STAR+PLUS','STAR Health'], 2, 'STAR+PLUS serves adults with disabilities and seniors.'),
('FL', 'Florida''s Medicaid managed care program is called?', ARRAY['SMMC','MMA','LTCC','Sunshine Health'], 0, 'Statewide Medicaid Managed Care (SMMC) is the umbrella program.'),
('NY', 'Which NY program covers long-term services and supports?', ARRAY['MLTC','HARP','MAP','Both MLTC and MAP'], 3, 'MLTC and MAP both cover LTSS in New York.'),
('PA', 'Pennsylvania''s LTSS managed care program is called?', ARRAY['HealthChoices','Community HealthChoices','LIFE','PA Health & Wellness'], 1, 'Community HealthChoices (CHC) covers dual-eligibles and LTSS.'),
('OH', 'Ohio''s Next Generation Medicaid managed care launched with how many MCOs?', ARRAY['4','5','6','7'], 2, 'Six MCOs were awarded contracts in the Next Generation procurement.');
