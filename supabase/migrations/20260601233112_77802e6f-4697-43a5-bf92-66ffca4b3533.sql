ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create missions" ON public.missions;
CREATE POLICY "Users can create missions" ON public.missions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can read missions" ON public.missions;
CREATE POLICY "Users can read missions" ON public.missions
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.is_mission_member(id, auth.uid()));

DROP POLICY IF EXISTS "Users can update missions" ON public.missions;
CREATE POLICY "Users can update missions" ON public.missions
  FOR UPDATE TO authenticated
  USING (public.has_mission_role(id, auth.uid(), ARRAY['admin','lead']));

ALTER TABLE public.mission_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can add themselves" ON public.mission_members;
CREATE POLICY "Users can add themselves" ON public.mission_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read members" ON public.mission_members;
CREATE POLICY "Users can read members" ON public.mission_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_mission_member(mission_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.missions TO authenticated;
GRANT ALL ON public.missions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_members TO authenticated;
GRANT ALL ON public.mission_members TO service_role;