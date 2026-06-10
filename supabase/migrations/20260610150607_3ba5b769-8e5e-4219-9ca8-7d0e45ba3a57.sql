DROP POLICY IF EXISTS "mjp all" ON public.mission_journey_phases;
CREATE POLICY "mjp all" ON public.mission_journey_phases FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.is_mission_team_member(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_mission_team_member(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));

DROP POLICY IF EXISTS "mjd all" ON public.mission_journey_deliverables;
CREATE POLICY "mjd all" ON public.mission_journey_deliverables FOR ALL
  USING (public.has_role(auth.uid(), 'admin') OR public.is_mission_team_member(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_mission_team_member(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));