DROP POLICY IF EXISTS "ma all" ON public.mission_assignments;
CREATE POLICY "ma all" ON public.mission_assignments FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.is_mission_team_member(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_mission_team_member(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));

DROP POLICY IF EXISTS "mas all" ON public.mission_assignment_smes;
CREATE POLICY "mas all" ON public.mission_assignment_smes FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mission_assignments a
      WHERE a.id = mission_assignment_smes.assignment_id
        AND (public.is_mission_team_member(a.mission_id, auth.uid()) OR public.is_mission_creator(a.mission_id, auth.uid()))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mission_assignments a
      WHERE a.id = mission_assignment_smes.assignment_id
        AND (public.is_mission_team_member(a.mission_id, auth.uid()) OR public.is_mission_creator(a.mission_id, auth.uid()))
    )
  );

CREATE POLICY "notifications insert by mission actors" ON public.atlas_notifications FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      (metadata ? 'mission_id')
      AND (
        public.is_mission_team_member((metadata->>'mission_id')::uuid, auth.uid())
        OR public.is_mission_creator((metadata->>'mission_id')::uuid, auth.uid())
      )
    )
  );