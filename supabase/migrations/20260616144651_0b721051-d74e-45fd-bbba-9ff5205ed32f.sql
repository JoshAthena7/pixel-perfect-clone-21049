CREATE OR REPLACE FUNCTION private.has_engagement_role(_engagement_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.missions m
    WHERE m.id = _engagement_id
      AND m.created_by = auth.uid()
      AND 'founder' = ANY(_roles)
  )
  OR EXISTS (
    SELECT 1
    FROM public.mission_team_members mtm
    JOIN public.atlas_team_members atm ON atm.id = mtm.member_id
    JOIN auth.users u ON lower(u.email) = lower(atm.email)
    WHERE mtm.mission_id = _engagement_id
      AND u.id = auth.uid()
      AND (
        mtm.mission_role = ANY(_roles)
        OR (mtm.mission_role = 'project_manager' AND 'pm' = ANY(_roles))
        OR (mtm.mission_role = 'pm' AND 'pm' = ANY(_roles))
        OR (mtm.mission_role = 'engagement_lead' AND 'engagement_lead' = ANY(_roles))
      )
  );
$function$;