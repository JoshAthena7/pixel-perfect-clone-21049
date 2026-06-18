
CREATE TABLE public.question_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  pinned_to_slack boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX question_notes_question_id_created_at_idx
  ON public.question_notes (question_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_notes TO authenticated;
GRANT ALL ON public.question_notes TO service_role;

ALTER TABLE public.question_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission team can view question notes"
  ON public.question_notes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_team_members mtm
      WHERE mtm.mission_id = question_notes.mission_id
        AND mtm.member_id = auth.uid()
    )
  );

CREATE POLICY "Mission team can create question notes"
  ON public.question_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.mission_team_members mtm
      WHERE mtm.mission_id = question_notes.mission_id
        AND mtm.member_id = auth.uid()
    )
  );

CREATE POLICY "Authors can update their own notes"
  ON public.question_notes
  FOR UPDATE
  TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors can delete their own notes"
  ON public.question_notes
  FOR DELETE
  TO authenticated
  USING (author_id = auth.uid());
