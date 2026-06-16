DROP POLICY IF EXISTS oracle_config_write ON public.oracle_engagement_config;

CREATE POLICY oracle_config_write
ON public.oracle_engagement_config
FOR ALL
TO authenticated
USING (
  private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
  OR public.is_platform_admin(auth.uid())
)
WITH CHECK (
  private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
  OR public.is_platform_admin(auth.uid())
);