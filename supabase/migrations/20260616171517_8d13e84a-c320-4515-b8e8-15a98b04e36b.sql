CREATE OR REPLACE FUNCTION public.can_manage_mission_assignments(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.is_mission_creator(_mission_id, _user_id)
    OR EXISTS (
      SELECT 1
      FROM public.mission_team_members mtm
      JOIN public.atlas_team_members atm ON atm.id = mtm.member_id
      JOIN auth.users u ON lower(u.email) = lower(atm.email)
      WHERE mtm.mission_id = _mission_id
        AND u.id = _user_id
        AND COALESCE(mtm.mission_role,'') IN ('engagement_lead','project_manager','pm','lead','owner','admin')
    );
$function$;