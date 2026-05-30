
CREATE TABLE public.compliance_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  name text NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('State Contract Template','State Program Requirements','State Regulatory','Federal Regulation','CMS Guidance','Other')),
  source text,
  file_path text,
  page_count integer,
  requirement_count integer NOT NULL DEFAULT 0,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_documents TO authenticated;
GRANT ALL ON public.compliance_documents TO service_role;
ALTER TABLE public.compliance_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_docs_select_members ON public.compliance_documents
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.engagement_members em
          WHERE em.engagement_id = compliance_documents.engagement_id AND em.user_id = auth.uid())
);
CREATE POLICY compliance_docs_insert_leadership ON public.compliance_documents
FOR INSERT TO authenticated WITH CHECK (public.user_has_any_leadership_role(auth.uid()));
CREATE POLICY compliance_docs_update_leadership ON public.compliance_documents
FOR UPDATE TO authenticated USING (public.user_has_any_leadership_role(auth.uid()))
WITH CHECK (public.user_has_any_leadership_role(auth.uid()));
CREATE POLICY compliance_docs_delete_leadership ON public.compliance_documents
FOR DELETE TO authenticated USING (public.user_has_any_leadership_role(auth.uid()));

CREATE INDEX idx_compliance_documents_engagement ON public.compliance_documents(engagement_id);

CREATE TABLE public.compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.compliance_documents(id) ON DELETE CASCADE,
  requirement_text text NOT NULL,
  section_reference text,
  requirement_type text CHECK (requirement_type IN ('SHALL','SHALL NOT','MUST','MUST NOT','REQUIRED','PROHIBITED')),
  status text NOT NULL DEFAULT 'Not Mapped' CHECK (status IN ('Not Mapped','Addressed','Partial','Gap')),
  addressed_in_sections text[] NOT NULL DEFAULT '{}',
  addressed_in_questions uuid[] NOT NULL DEFAULT '{}',
  notes text,
  ai_verified boolean NOT NULL DEFAULT false,
  ai_quote text,
  ai_explanation text,
  ai_confidence numeric,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_requirements TO authenticated;
GRANT ALL ON public.compliance_requirements TO service_role;
ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_req_select_members ON public.compliance_requirements
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.engagement_members em
          WHERE em.engagement_id = compliance_requirements.engagement_id AND em.user_id = auth.uid())
);
CREATE POLICY compliance_req_insert_leadership ON public.compliance_requirements
FOR INSERT TO authenticated WITH CHECK (public.user_has_any_leadership_role(auth.uid()));
CREATE POLICY compliance_req_update_leadership ON public.compliance_requirements
FOR UPDATE TO authenticated USING (public.user_has_any_leadership_role(auth.uid()))
WITH CHECK (public.user_has_any_leadership_role(auth.uid()));
CREATE POLICY compliance_req_delete_leadership ON public.compliance_requirements
FOR DELETE TO authenticated USING (public.user_has_any_leadership_role(auth.uid()));

CREATE INDEX idx_compliance_requirements_engagement ON public.compliance_requirements(engagement_id);
CREATE INDEX idx_compliance_requirements_document ON public.compliance_requirements(document_id);
CREATE INDEX idx_compliance_requirements_status ON public.compliance_requirements(status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.compliance_requirements;

CREATE OR REPLACE FUNCTION public.get_engagement_compliance_score(_engagement_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN count(*) FILTER (WHERE status <> 'Not Mapped') = 0 THEN 0
    ELSE round(
      (count(*) FILTER (WHERE status = 'Addressed')::numeric
       / count(*) FILTER (WHERE status <> 'Not Mapped')::numeric) * 100, 1)
  END
  FROM public.compliance_requirements
  WHERE engagement_id = _engagement_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_engagement_compliance_score(uuid) TO authenticated, service_role;

-- Storage bucket for compliance docs
INSERT INTO storage.buckets (id, name, public) VALUES ('compliance-docs', 'compliance-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY compliance_storage_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'compliance-docs');
CREATE POLICY compliance_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'compliance-docs' AND public.user_has_any_leadership_role(auth.uid()));
CREATE POLICY compliance_storage_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'compliance-docs' AND public.user_has_any_leadership_role(auth.uid()));
