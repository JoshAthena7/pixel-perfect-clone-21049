
-- 1) atlas_team_members: drop overly broad self-row SELECT exposing HR fields
DROP POLICY IF EXISTS "Users can view their own atlas_team_member row" ON public.atlas_team_members;

-- 2) checkin_submissions: add admin + mission-lead visibility
CREATE POLICY "Admins and mission leads view checkin submissions"
  ON public.checkin_submissions
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_manage_mission_assignments(mission_id, auth.uid())
  );

-- 3) mission_assist_events: fix swapped args
DROP POLICY IF EXISTS mae_select ON public.mission_assist_events;
DROP POLICY IF EXISTS mae_insert ON public.mission_assist_events;
CREATE POLICY mae_select ON public.mission_assist_events
  FOR SELECT TO authenticated
  USING (
    public.is_mission_member(mission_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY mae_insert ON public.mission_assist_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      public.is_mission_member(mission_id, auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- 4) mission_pulse_updates: fix swapped args
DROP POLICY IF EXISTS mpu_select ON public.mission_pulse_updates;
DROP POLICY IF EXISTS mpu_insert ON public.mission_pulse_updates;
CREATE POLICY mpu_select ON public.mission_pulse_updates
  FOR SELECT TO authenticated
  USING (
    public.is_mission_member(mission_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );
CREATE POLICY mpu_insert ON public.mission_pulse_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    updated_by = auth.uid()
    AND (
      public.is_mission_member(mission_id, auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- 5) question_pulses: add admin + mission-lead visibility
CREATE POLICY "Admins and mission leads view question pulses"
  ON public.question_pulses
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_manage_mission_assignments(mission_id, auth.uid())
  );
