
-- ============================================================
-- ATLAS Expertise Profile redesign
-- New structured expertise library + per-user tags + IRIS stubs
-- ============================================================

-- 1. Master library
CREATE TABLE public.expertise_library (
  id text PRIMARY KEY,
  label text NOT NULL,
  category text NOT NULL CHECK (category IN ('programs-populations','functional','procurement-market','leadership')),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.expertise_library TO authenticated, anon;
GRANT ALL ON public.expertise_library TO service_role;
ALTER TABLE public.expertise_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expertise_library_read_all" ON public.expertise_library FOR SELECT TO authenticated USING (true);
CREATE POLICY "expertise_library_admin_manage" ON public.expertise_library FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Per-user expertise
CREATE TABLE public.user_expertise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expertise_id text REFERENCES public.expertise_library(id) ON DELETE CASCADE,
  custom_label text,
  is_primary boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_expertise_one_kind CHECK ((expertise_id IS NOT NULL AND custom_label IS NULL) OR (expertise_id IS NULL AND custom_label IS NOT NULL)),
  CONSTRAINT user_expertise_custom_len CHECK (custom_label IS NULL OR (char_length(custom_label) BETWEEN 2 AND 40))
);
CREATE UNIQUE INDEX user_expertise_uniq_structured ON public.user_expertise(user_id, expertise_id) WHERE expertise_id IS NOT NULL;
CREATE UNIQUE INDEX user_expertise_uniq_custom ON public.user_expertise(user_id, lower(custom_label)) WHERE custom_label IS NOT NULL;
CREATE INDEX user_expertise_user_idx ON public.user_expertise(user_id);
CREATE INDEX user_expertise_expertise_idx ON public.user_expertise(expertise_id) WHERE expertise_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_expertise TO authenticated;
GRANT ALL ON public.user_expertise TO service_role;
ALTER TABLE public.user_expertise ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_expertise_read_all" ON public.user_expertise FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_expertise_self_write" ON public.user_expertise FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Enforce max 5 primary per user
CREATE OR REPLACE FUNCTION public.user_expertise_enforce_primary_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c int;
BEGIN
  IF NEW.is_primary THEN
    SELECT count(*) INTO c FROM public.user_expertise WHERE user_id = NEW.user_id AND is_primary = true AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF c >= 5 THEN RAISE EXCEPTION 'Maximum of 5 primary expertise areas allowed'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_user_expertise_primary_limit BEFORE INSERT OR UPDATE OF is_primary ON public.user_expertise
  FOR EACH ROW EXECUTE FUNCTION public.user_expertise_enforce_primary_limit();

-- 3. Search index view (always fresh)
CREATE OR REPLACE VIEW public.expertise_user_index AS
  SELECT expertise_id, user_id, is_primary
  FROM public.user_expertise
  WHERE expertise_id IS NOT NULL;
GRANT SELECT ON public.expertise_user_index TO authenticated;

-- 4. Mission-to-expertise signals (IRIS layer, separate from mission_member_expertise)
CREATE TABLE public.mission_expertise_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  expertise_id text NOT NULL REFERENCES public.expertise_library(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('win_theme','oracle','rfp_program_type','manual')),
  weight numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, expertise_id, source)
);
CREATE INDEX mission_expertise_signals_mission_idx ON public.mission_expertise_signals(mission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_expertise_signals TO authenticated;
GRANT ALL ON public.mission_expertise_signals TO service_role;
ALTER TABLE public.mission_expertise_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mes_member_read" ON public.mission_expertise_signals FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "mes_lead_write" ON public.mission_expertise_signals FOR ALL TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

-- 5. IRIS staffing recommendations stub (spec 8C)
CREATE TABLE public.iris_staffing_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matched_expertise text[] NOT NULL DEFAULT '{}',
  primary_match boolean NOT NULL DEFAULT false,
  match_score numeric NOT NULL DEFAULT 0,
  recommendation_reason text,
  expertise_signals_used text[] NOT NULL DEFAULT '{}',
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX iris_staffing_recs_mission_idx ON public.iris_staffing_recommendations(mission_id);
GRANT SELECT ON public.iris_staffing_recommendations TO authenticated;
GRANT ALL ON public.iris_staffing_recommendations TO service_role;
ALTER TABLE public.iris_staffing_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "isr_member_read" ON public.iris_staffing_recommendations FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

-- 6. IRIS expertise coverage stub (spec 8D)
CREATE TABLE public.iris_expertise_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expertise_id text NOT NULL REFERENCES public.expertise_library(id) ON DELETE CASCADE,
  total_users integer NOT NULL DEFAULT 0,
  primary_users integer NOT NULL DEFAULT 0,
  is_coverage_gap boolean NOT NULL DEFAULT false,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expertise_id, calculated_at)
);
GRANT SELECT ON public.iris_expertise_coverage TO authenticated;
GRANT ALL ON public.iris_expertise_coverage TO service_role;
ALTER TABLE public.iris_expertise_coverage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iec_read_all" ON public.iris_expertise_coverage FOR SELECT TO authenticated USING (true);

-- Manual refresh function for coverage snapshot
CREATE OR REPLACE FUNCTION public.refresh_iris_expertise_coverage()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ts timestamptz := now();
BEGIN
  INSERT INTO public.iris_expertise_coverage (expertise_id, total_users, primary_users, is_coverage_gap, calculated_at)
  SELECT l.id,
         COALESCE(count(ue.user_id), 0),
         COALESCE(count(ue.user_id) FILTER (WHERE ue.is_primary), 0),
         COALESCE(count(ue.user_id) FILTER (WHERE ue.is_primary), 0) < 3,
         ts
  FROM public.expertise_library l
  LEFT JOIN public.user_expertise ue ON ue.expertise_id = l.id
  GROUP BY l.id;
END $$;

-- 7. Seed library
INSERT INTO public.expertise_library (id, label, category, sort_order) VALUES
  -- Programs & Populations
  ('ltss','LTSS','programs-populations',10),
  ('mltss','MLTSS','programs-populations',20),
  ('hcbs','HCBS','programs-populations',30),
  ('idd','IDD','programs-populations',40),
  ('dual-eligible','Dual Eligible','programs-populations',50),
  ('dsnp','D-SNP','programs-populations',60),
  ('aging','Aging','programs-populations',70),
  ('pace','PACE','programs-populations',80),
  ('behavioral-health','Behavioral Health','programs-populations',90),
  ('sud','SUD','programs-populations',100),
  ('child-welfare','Child Welfare','programs-populations',110),
  ('foster-care','Foster Care','programs-populations',120),
  ('childrens-system-of-care','Children''s System of Care','programs-populations',130),
  ('justice-involved','Justice Involved','programs-populations',140),
  ('maternal-health','Maternal Health','programs-populations',150),
  ('population-health','Population Health','programs-populations',160),
  ('complex-care','Complex Care','programs-populations',170),
  ('special-needs-plans','Special Needs Plans','programs-populations',180),
  -- Functional
  ('proposal-writing','Proposal Writing','functional',10),
  ('proposal-management','Proposal Management','functional',20),
  ('capture-strategy','Capture Strategy','functional',30),
  ('product-development','Product Development','functional',40),
  ('operations','Operations','functional',50),
  ('care-management','Care Management','functional',60),
  ('quality-management','Quality Management','functional',70),
  ('clinical-programs','Clinical Programs','functional',80),
  ('provider-relations','Provider Relations','functional',90),
  ('network-development','Network Development','functional',100),
  ('compliance','Compliance','functional',110),
  ('finance','Finance','functional',120),
  ('actuarial','Actuarial','functional',130),
  ('data-analytics','Data Analytics','functional',140),
  ('reporting','Reporting','functional',150),
  ('it-systems','IT Systems','functional',160),
  ('technology-strategy','Technology Strategy','functional',170),
  ('implementation','Implementation','functional',180),
  ('program-integrity','Program Integrity','functional',190),
  ('value-based-care','Value-Based Care','functional',200),
  -- Procurement & Market
  ('medicaid-managed-care','Medicaid Managed Care','procurement-market',10),
  ('medicare-advantage','Medicare Advantage','procurement-market',20),
  ('duals','Duals','procurement-market',30),
  ('aco','ACO','procurement-market',40),
  ('state-government','State Government','procurement-market',50),
  ('federal-programs','Federal Programs','procurement-market',60),
  ('waiver-programs','Waiver Programs','procurement-market',70),
  ('procurement-strategy','Procurement Strategy','procurement-market',80),
  ('competitive-intelligence','Competitive Intelligence','procurement-market',90),
  ('market-entry-strategy','Market Entry Strategy','procurement-market',100),
  ('business-development','Business Development','procurement-market',110),
  -- Leadership
  ('executive-leadership','Executive Leadership','leadership',10),
  ('market-president','Market President','leadership',20),
  ('ceo','CEO','leadership',30),
  ('coo','COO','leadership',40),
  ('cmo','CMO','leadership',50),
  ('growth-executive','Growth Executive','leadership',60),
  ('medicaid-director','Medicaid Director','leadership',70),
  ('state-agency-leadership','State Agency Leadership','leadership',80),
  ('consulting-leadership','Consulting Leadership','leadership',90);

-- 8. Drop old expertise_options table (Replace per user direction)
DROP TABLE IF EXISTS public.expertise_options;
