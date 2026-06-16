
CREATE OR REPLACE FUNCTION public.user_has_any_leadership_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.mission_team_members mtm
      WHERE mtm.member_id = _user_id
        AND mtm.mission_role IN ('engagement_lead', 'lead_writer', 'reviewer')
    );
$function$;
