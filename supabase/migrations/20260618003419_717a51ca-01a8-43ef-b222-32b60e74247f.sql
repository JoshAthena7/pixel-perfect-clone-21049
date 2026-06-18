-- Categories enum
CREATE TYPE public.state_intel_category AS ENUM (
  'waivers_authorities',
  'state_plan_amendments',
  'managed_care_landscape',
  'quality_strategy',
  'directed_payments',
  'core_set_performance',
  'legislative_budget',
  'rate_setting',
  'eligibility_enrollment',
  'workforce_network',
  'demographics_health',
  'litigation_compliance'
);

-- Packs table (one per state)
CREATE TABLE public.state_intel_packs (
  state_code TEXT PRIMARY KEY,
  state_name TEXT NOT NULL,
  notes TEXT,
  last_reviewed_at TIMESTAMPTZ,
  last_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_intel_packs TO authenticated;
GRANT ALL ON public.state_intel_packs TO service_role;

ALTER TABLE public.state_intel_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read state packs"
  ON public.state_intel_packs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage state packs"
  ON public.state_intel_packs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Documents table
CREATE TABLE public.state_intel_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code TEXT NOT NULL REFERENCES public.state_intel_packs(state_code) ON DELETE CASCADE,
  category public.state_intel_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  effective_date DATE,
  expires_at DATE,
  is_current BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_state_intel_documents_state_cat
  ON public.state_intel_documents(state_code, category, is_current);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_intel_documents TO authenticated;
GRANT ALL ON public.state_intel_documents TO service_role;

ALTER TABLE public.state_intel_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read state documents"
  ON public.state_intel_documents FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage state documents"
  ON public.state_intel_documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER trg_state_intel_packs_updated
  BEFORE UPDATE ON public.state_intel_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS policies (bucket created via tool)
CREATE POLICY "Authenticated can read state-intel files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'state-intel');

CREATE POLICY "Admins write state-intel files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'state-intel' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update state-intel files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'state-intel' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete state-intel files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'state-intel' AND public.has_role(auth.uid(), 'admin'));
