
CREATE TABLE IF NOT EXISTS public.question_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL,
  question_id UUID NOT NULL,
  user_id UUID NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_views_question_idx ON public.question_views (question_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS question_views_mission_idx ON public.question_views (mission_id, viewed_at DESC);

GRANT SELECT, INSERT ON public.question_views TO authenticated;
GRANT ALL ON public.question_views TO service_role;

ALTER TABLE public.question_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read question views"
  ON public.question_views FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_team_members mtm
      WHERE mtm.mission_id = question_views.mission_id
        AND mtm.member_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = question_views.mission_id
        AND m.created_by = auth.uid()
    )
  );

CREATE POLICY "Users log their own question views"
  ON public.question_views FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
