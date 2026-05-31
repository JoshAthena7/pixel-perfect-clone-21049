-- =========================
-- engagement_rfp_data
-- =========================
CREATE TABLE public.engagement_rfp_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL UNIQUE REFERENCES public.engagements(id) ON DELETE CASCADE,
  issuing_agency TEXT,
  contract_type TEXT,
  contract_value TEXT,
  contract_term TEXT,
  evaluation_method TEXT,
  incumbent TEXT,
  compliance_notes TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_rfp_data TO authenticated;
GRANT ALL ON public.engagement_rfp_data TO service_role;

ALTER TABLE public.engagement_rfp_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfp_data_select_member"
  ON public.engagement_rfp_data FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "rfp_data_insert_leadership"
  ON public.engagement_rfp_data FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "rfp_data_update_leadership"
  ON public.engagement_rfp_data FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "rfp_data_delete_leadership"
  ON public.engagement_rfp_data FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER engagement_rfp_data_updated_at
  BEFORE UPDATE ON public.engagement_rfp_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- rfp_evaluation_criteria
-- =========================
CREATE TABLE public.rfp_evaluation_criteria (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  weight NUMERIC(5,2),
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rfp_criteria_eng ON public.rfp_evaluation_criteria (engagement_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfp_evaluation_criteria TO authenticated;
GRANT ALL ON public.rfp_evaluation_criteria TO service_role;

ALTER TABLE public.rfp_evaluation_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfp_criteria_select_member"
  ON public.rfp_evaluation_criteria FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "rfp_criteria_insert_leadership"
  ON public.rfp_evaluation_criteria FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "rfp_criteria_update_leadership"
  ON public.rfp_evaluation_criteria FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "rfp_criteria_delete_leadership"
  ON public.rfp_evaluation_criteria FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER rfp_evaluation_criteria_updated_at
  BEFORE UPDATE ON public.rfp_evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();