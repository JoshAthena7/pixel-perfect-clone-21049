DROP POLICY IF EXISTS oracle_config_select ON public.oracle_engagement_config;
DROP POLICY IF EXISTS oracle_config_write ON public.oracle_engagement_config;

CREATE POLICY oracle_config_select
ON public.oracle_engagement_config
FOR SELECT
TO authenticated
USING (
  public.is_mission_creator(mission_id, auth.uid())
  OR public.is_mission_team_member(mission_id, auth.uid())
  OR public.is_platform_admin(auth.uid())
);

CREATE POLICY oracle_config_write
ON public.oracle_engagement_config
FOR ALL
TO authenticated
USING (
  public.is_mission_creator(mission_id, auth.uid())
  OR public.is_mission_team_member(mission_id, auth.uid())
  OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
  public.is_mission_creator(mission_id, auth.uid())
  OR public.is_mission_team_member(mission_id, auth.uid())
  OR public.is_platform_admin(auth.uid())
);