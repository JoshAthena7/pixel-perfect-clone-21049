-- mission_documents table
CREATE TABLE public.mission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'RFP','Amendment','Model Contract','Regulation','Waiver',
    'Legislative','Stakeholder Report','Advocacy','Research','News',
    'Provider Materials','Incumbent Report','Other'
  )),
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','complete','error')),
  extracted_text text,
  page_count integer,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mission_documents_mission ON public.mission_documents(mission_id);
CREATE INDEX idx_mission_documents_status ON public.mission_documents(mission_id, processing_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_documents TO authenticated;
GRANT ALL ON public.mission_documents TO service_role;

ALTER TABLE public.mission_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members read mission_documents"
  ON public.mission_documents FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members insert mission_documents"
  ON public.mission_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members update mission_documents"
  ON public.mission_documents FOR UPDATE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members delete mission_documents"
  ON public.mission_documents FOR DELETE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_mission_documents_updated
  BEFORE UPDATE ON public.mission_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- mission_intelligence table
CREATE TABLE public.mission_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  layer text NOT NULL CHECK (layer IN ('mission_brief','strategic_assessment')),
  content jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  generated_at timestamptz NOT NULL DEFAULT now(),
  source_document_ids uuid[] NOT NULL DEFAULT '{}',
  iris_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, layer)
);

CREATE INDEX idx_mission_intelligence_mission ON public.mission_intelligence(mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_intelligence TO authenticated;
GRANT ALL ON public.mission_intelligence TO service_role;

ALTER TABLE public.mission_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members read mission_intelligence"
  ON public.mission_intelligence FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members insert mission_intelligence"
  ON public.mission_intelligence FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members update mission_intelligence"
  ON public.mission_intelligence FOR UPDATE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members delete mission_intelligence"
  ON public.mission_intelligence FOR DELETE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_mission_intelligence_updated
  BEFORE UPDATE ON public.mission_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage RLS for mission-documents bucket
-- (bucket itself created via storage_create_bucket tool)
CREATE POLICY "Mission members read mission-documents storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'mission-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.mission_members mm
        WHERE mm.user_id = auth.uid()
          AND mm.mission_id::text = split_part(name, '/', 1)
      )
    )
  );

CREATE POLICY "Mission members insert mission-documents storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mission-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.mission_members mm
        WHERE mm.user_id = auth.uid()
          AND mm.mission_id::text = split_part(name, '/', 1)
      )
    )
  );

CREATE POLICY "Mission members delete mission-documents storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'mission-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.mission_members mm
        WHERE mm.user_id = auth.uid()
          AND mm.mission_id::text = split_part(name, '/', 1)
      )
    )
  );