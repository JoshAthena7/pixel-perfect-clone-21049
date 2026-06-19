
DROP POLICY IF EXISTS "Mission team can create question notes" ON public.question_notes;
DROP POLICY IF EXISTS "Mission team can view question notes" ON public.question_notes;

CREATE POLICY "Mission team can view question notes"
  ON public.question_notes
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = question_notes.mission_id AND m.created_by = auth.uid()
    )
  );

CREATE POLICY "Mission team can create question notes"
  ON public.question_notes
  FOR INSERT
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.is_mission_team_member(mission_id, auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.missions m
        WHERE m.id = question_notes.mission_id AND m.created_by = auth.uid()
      )
    )
  );
