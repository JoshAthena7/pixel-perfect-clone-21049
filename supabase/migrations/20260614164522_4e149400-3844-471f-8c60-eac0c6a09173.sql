ALTER TABLE public.intel_events ALTER COLUMN mission_id DROP NOT NULL;

-- Allow read of platform-level events (mission_id IS NULL) to any authenticated user;
-- mission-scoped events keep existing membership rules.
DROP POLICY IF EXISTS "mission members read events" ON public.intel_events;
CREATE POLICY "mission members read events"
  ON public.intel_events FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR mission_id IS NULL
    OR is_mission_member_user(mission_id, auth.uid())
    OR is_mission_creator(mission_id, auth.uid())
  );