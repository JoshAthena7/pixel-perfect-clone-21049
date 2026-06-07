
CREATE TABLE public.section_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.mission_sections(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  content jsonb,
  question_set jsonb,
  writer_answers jsonb,
  refined_brief jsonb,
  refined_brief_version int NOT NULL DEFAULT 0,
  question_status text NOT NULL DEFAULT 'not_started'
    CHECK (question_status IN ('not_started','questions_ready','answering','answers_submitted','refined_brief_ready')),
  questions_generated_at timestamptz,
  answers_submitted_at timestamptz,
  refined_brief_generated_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX section_briefs_mission_idx ON public.section_briefs(mission_id);
CREATE INDEX section_briefs_section_idx ON public.section_briefs(section_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_briefs TO authenticated;
GRANT ALL ON public.section_briefs TO service_role;

ALTER TABLE public.section_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members view section briefs"
  ON public.section_briefs FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members insert section briefs"
  ON public.section_briefs FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members update section briefs"
  ON public.section_briefs FOR UPDATE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Mission members delete section briefs"
  ON public.section_briefs FOR DELETE TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER section_briefs_updated_at
  BEFORE UPDATE ON public.section_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
