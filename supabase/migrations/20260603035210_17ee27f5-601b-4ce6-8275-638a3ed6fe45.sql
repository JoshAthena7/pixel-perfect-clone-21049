-- document_extractions: stores AI-extracted content + themes/entities for each mission_library document.
-- Used by the IRIS Briefing Book aggregation pipeline and the Library indexing status panel.

CREATE TABLE public.document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES public.mission_library(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  extracted_text text,
  key_themes text[] NOT NULL DEFAULT '{}',
  key_entities text[] NOT NULL DEFAULT '{}',
  summary text,
  status text NOT NULL DEFAULT 'ready',
  error_message text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_extractions_mission ON public.document_extractions(mission_id);
CREATE INDEX idx_document_extractions_processed_at ON public.document_extractions(processed_at DESC);

-- Grants: scoped to mission members via RLS; service_role for server fns.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_extractions TO authenticated;
GRANT ALL ON public.document_extractions TO service_role;

ALTER TABLE public.document_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read extractions"
  ON public.document_extractions
  FOR SELECT
  TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "Mission members can insert extractions"
  ON public.document_extractions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "Mission members can update extractions"
  ON public.document_extractions
  FOR UPDATE
  TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "Mission members can delete extractions"
  ON public.document_extractions
  FOR DELETE
  TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE TRIGGER trg_document_extractions_touch
  BEFORE UPDATE ON public.document_extractions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
