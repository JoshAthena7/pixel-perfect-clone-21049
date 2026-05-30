
-- 1. Extend reference table
ALTER TABLE public.state_resources
  ADD COLUMN IF NOT EXISTS medicaid_agency_url text;

-- 2. Populate Medicaid agency URLs (state Medicaid program homepage)
UPDATE public.state_resources SET medicaid_agency_url = v.url FROM (VALUES
  ('AL','https://medicaid.alabama.gov'),
  ('AK','https://health.alaska.gov/dhcs/Pages/medicaid/default.aspx'),
  ('AZ','https://www.azahcccs.gov'),
  ('AR','https://humanservices.arkansas.gov/divisions-shared-services/medical-services'),
  ('CA','https://www.dhcs.ca.gov/services/medi-cal'),
  ('CO','https://hcpf.colorado.gov'),
  ('CT','https://portal.ct.gov/dss/health-and-home-care/husky-health'),
  ('DE','https://dhss.delaware.gov/dhss/dmma'),
  ('DC','https://dhcf.dc.gov'),
  ('FL','https://ahca.myflorida.com/medicaid'),
  ('GA','https://medicaid.georgia.gov'),
  ('HI','https://medquest.hawaii.gov'),
  ('ID','https://healthandwelfare.idaho.gov/services-programs/medicaid-health'),
  ('IL','https://hfs.illinois.gov/medicalprograms.html'),
  ('IN','https://www.in.gov/medicaid'),
  ('IA','https://hhs.iowa.gov/programs/welcome-iowa-medicaid'),
  ('KS','https://www.kancare.ks.gov'),
  ('KY','https://www.chfs.ky.gov/agencies/dms'),
  ('LA','https://ldh.la.gov/medicaid'),
  ('ME','https://www.maine.gov/dhhs/oms'),
  ('MD','https://health.maryland.gov/mmcp'),
  ('MA','https://www.mass.gov/masshealth'),
  ('MI','https://www.michigan.gov/mdhhs/assistance-programs/medicaid'),
  ('MN','https://mn.gov/dhs/people-we-serve/adults/health-care/health-care-programs'),
  ('MS','https://medicaid.ms.gov'),
  ('MO','https://mydss.mo.gov/healthcare'),
  ('MT','https://dphhs.mt.gov/MontanaHealthcarePrograms'),
  ('NE','https://dhhs.ne.gov/medicaid'),
  ('NV','https://dhcfp.nv.gov'),
  ('NH','https://www.dhhs.nh.gov/programs-services/medicaid'),
  ('NJ','https://www.nj.gov/humanservices/dmahs'),
  ('NM','https://www.hsd.state.nm.us/lookingforassistance/medical-assistance-division'),
  ('NY','https://www.health.ny.gov/health_care/medicaid'),
  ('NC','https://medicaid.ncdhhs.gov'),
  ('ND','https://www.hhs.nd.gov/medicaid'),
  ('OH','https://medicaid.ohio.gov'),
  ('OK','https://oklahoma.gov/ohca.html'),
  ('OR','https://www.oregon.gov/oha/hsd/ohp'),
  ('PA','https://www.dhs.pa.gov/Services/Assistance/Pages/Medical-Assistance.aspx'),
  ('RI','https://eohhs.ri.gov/consumer/programs-and-services/medical-assistance'),
  ('SC','https://www.scdhhs.gov'),
  ('SD','https://dss.sd.gov/medicaid'),
  ('TN','https://www.tn.gov/tenncare'),
  ('TX','https://www.hhs.texas.gov/services/health/medicaid-chip'),
  ('UT','https://medicaid.utah.gov'),
  ('VT','https://dvha.vermont.gov'),
  ('VA','https://www.dmas.virginia.gov'),
  ('WA','https://www.hca.wa.gov/free-or-low-cost-health-care/apple-health-medicaid-coverage'),
  ('WV','https://dhhr.wv.gov/bms'),
  ('WI','https://www.dhs.wisconsin.gov/medicaid'),
  ('WY','https://health.wyo.gov/healthcarefin/medicaid')
) AS v(state, url)
WHERE public.state_resources.state = v.state;

-- 3. Seeder function: insert State Intelligence rows for a given engagement, idempotent
CREATE OR REPLACE FUNCTION public.seed_state_intel(_engagement_id uuid, _state text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF _state IS NULL OR _engagement_id IS NULL THEN RETURN; END IF;

  SELECT state_name, procurement_portal_url, medicaid_agency_url, small_business_program
  INTO r
  FROM public.state_resources
  WHERE state = _state;
  IF NOT FOUND THEN RETURN; END IF;

  IF r.procurement_portal_url IS NOT NULL THEN
    INSERT INTO public.intel_documents (engagement_id, name, category, url, notes)
    SELECT _engagement_id,
           r.state_name || ' Procurement Portal',
           'State Intelligence',
           r.procurement_portal_url,
           'Auto-seeded — official ' || r.state_name || ' procurement portal.'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.intel_documents
      WHERE engagement_id = _engagement_id AND url = r.procurement_portal_url
    );
  END IF;

  IF r.medicaid_agency_url IS NOT NULL THEN
    INSERT INTO public.intel_documents (engagement_id, name, category, url, notes)
    SELECT _engagement_id,
           r.state_name || ' Medicaid Agency',
           'State Intelligence',
           r.medicaid_agency_url,
           'Auto-seeded — official ' || r.state_name || ' Medicaid agency website.'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.intel_documents
      WHERE engagement_id = _engagement_id AND url = r.medicaid_agency_url
    );
  END IF;

  IF r.small_business_program IS NOT NULL THEN
    INSERT INTO public.intel_documents (engagement_id, name, category, notes)
    SELECT _engagement_id,
           r.state_name || ' Small Business Program',
           'State Intelligence',
           'Auto-seeded — ' || r.small_business_program
    WHERE NOT EXISTS (
      SELECT 1 FROM public.intel_documents
      WHERE engagement_id = _engagement_id
        AND category = 'State Intelligence'
        AND name = r.state_name || ' Small Business Program'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_state_intel(uuid, text) TO authenticated, service_role;

-- 4. Trigger on engagement_config: when state is set or changes, seed intel
CREATE OR REPLACE FUNCTION public.trg_seed_state_intel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.state IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.state IS DISTINCT FROM OLD.state) THEN
    PERFORM public.seed_state_intel(NEW.engagement_id, NEW.state);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_state_intel_on_config ON public.engagement_config;
CREATE TRIGGER seed_state_intel_on_config
  AFTER INSERT OR UPDATE OF state ON public.engagement_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_state_intel();
