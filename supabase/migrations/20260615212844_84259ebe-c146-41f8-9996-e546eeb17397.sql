DROP POLICY IF EXISTS "mtm delete" ON public.mission_team_members;
DROP POLICY IF EXISTS "mtm update" ON public.mission_team_members;

CREATE POLICY "mtm delete" ON public.mission_team_members FOR DELETE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_mission_team_member(mission_id, auth.uid())
  OR EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_team_members.mission_id AND m.created_by = auth.uid())
);

CREATE POLICY "mtm update" ON public.mission_team_members FOR UPDATE USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_mission_team_member(mission_id, auth.uid())
  OR EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_team_members.mission_id AND m.created_by = auth.uid())
) WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_mission_team_member(mission_id, auth.uid())
  OR EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_team_members.mission_id AND m.created_by = auth.uid())
);