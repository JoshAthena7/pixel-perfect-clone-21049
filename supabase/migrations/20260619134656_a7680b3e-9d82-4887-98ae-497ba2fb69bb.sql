CREATE TABLE IF NOT EXISTS public.mission_activity (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE NOT NULL,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_activity_mission
  ON public.mission_activity(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_activity_type
  ON public.mission_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_mission_activity_question
  ON public.mission_activity(question_id)
  WHERE question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mission_activity_actor
  ON public.mission_activity(actor_id)
  WHERE actor_id IS NOT NULL;

GRANT SELECT, INSERT ON public.mission_activity TO authenticated;
GRANT ALL ON public.mission_activity TO service_role;

ALTER TABLE public.mission_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read activity"
ON public.mission_activity FOR SELECT
TO authenticated
USING (public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "Mission members can insert activity"
ON public.mission_activity FOR INSERT
TO authenticated
WITH CHECK (public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "Admins manage all activity"
ON public.mission_activity FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));