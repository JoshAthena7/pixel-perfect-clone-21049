
CREATE TYPE public.vault_doc_type AS ENUM ('data_security','contract','scope_of_work','style_guide','other');

CREATE TABLE public.mission_vault_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  doc_type public.vault_doc_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  file_size BIGINT,
  mime_type TEXT,
  version TEXT,
  external_url TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mvd_mission ON public.mission_vault_documents(mission_id);
CREATE INDEX idx_mvd_type ON public.mission_vault_documents(mission_id, doc_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_vault_documents TO authenticated;
GRANT ALL ON public.mission_vault_documents TO service_role;

ALTER TABLE public.mission_vault_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mvd_select_members" ON public.mission_vault_documents
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

CREATE POLICY "mvd_insert_leads" ON public.mission_vault_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = mission_vault_documents.mission_id
        AND mm.user_id = auth.uid()
        AND mm.role IN ('admin','lead')
    )
  );

CREATE POLICY "mvd_update_leads" ON public.mission_vault_documents
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = mission_vault_documents.mission_id
        AND mm.user_id = auth.uid()
        AND mm.role IN ('admin','lead')
    )
  );

CREATE POLICY "mvd_delete_leads" ON public.mission_vault_documents
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.mission_id = mission_vault_documents.mission_id
        AND mm.user_id = auth.uid()
        AND mm.role IN ('admin','lead')
    )
  );

CREATE TRIGGER trg_mvd_updated_at
  BEFORE UPDATE ON public.mission_vault_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
