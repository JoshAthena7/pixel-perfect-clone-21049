
CREATE TABLE IF NOT EXISTS public.question_response_outlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.mission_documents(id) ON DELETE SET NULL,
  section_headers text[] DEFAULT '{}'::text[],
  content_guidance text,
  word_allocation jsonb DEFAULT '{}'::jsonb,
  total_word_limit integer,
  format_notes text,
  required_elements text[] DEFAULT '{}'::text[],
  prohibited_elements text[] DEFAULT '{}'::text[],
  source_text text,
  confidence numeric(3,2),
  parsed_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_response_outlines TO authenticated;
GRANT ALL ON public.question_response_outlines TO service_role;

ALTER TABLE public.question_response_outlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members read outlines" ON public.question_response_outlines
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = question_response_outlines.mission_id
        AND m.created_by = auth.uid()
    )
  );

CREATE POLICY "Leads write outlines" ON public.question_response_outlines
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_team_members mtm
      WHERE mtm.mission_id = question_response_outlines.mission_id
        AND mtm.member_id = auth.uid()
        AND mtm.mission_role IN ('engagement_lead', 'Proposal Manager', 'project_manager', 'Lead Writer')
    )
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = question_response_outlines.mission_id
        AND m.created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_team_members mtm
      WHERE mtm.mission_id = question_response_outlines.mission_id
        AND mtm.member_id = auth.uid()
        AND mtm.mission_role IN ('engagement_lead', 'Proposal Manager', 'project_manager', 'Lead Writer')
    )
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = question_response_outlines.mission_id
        AND m.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_qro_mission ON public.question_response_outlines(mission_id);
CREATE INDEX IF NOT EXISTS idx_qro_question ON public.question_response_outlines(question_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qro_unique_per_doc_question
  ON public.question_response_outlines(mission_id, document_id, COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TRIGGER update_qro_updated_at
  BEFORE UPDATE ON public.question_response_outlines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
