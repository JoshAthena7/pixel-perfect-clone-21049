
ALTER TABLE public.mission_assignments
  ADD COLUMN IF NOT EXISTS sme_member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON TABLE public.mission_assignments IS
  'Single source of truth for question assignments. Mutations are restricted to mission admins/owners and only happen in Olympus. Flight Deck and Threads display assignments read-only.';
COMMENT ON COLUMN public.mission_assignments.assigned_writer_id IS
  'Lead Writer for this question. References atlas_team_members.id (mission team member).';
COMMENT ON COLUMN public.mission_assignments.sme_member_ids IS
  'Subject Matter Experts assigned to this question. Array of atlas_team_members.id values.';

CREATE OR REPLACE FUNCTION public.can_manage_mission_assignments(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        AND COALESCE(mtm.mission_role,'') IN ('engagement_lead','lead','owner','admin')
    );
$$;

DROP POLICY IF EXISTS ma ON public.mission_assignments;
DROP POLICY IF EXISTS ma_select ON public.mission_assignments;
DROP POLICY IF EXISTS ma_insert ON public.mission_assignments;
DROP POLICY IF EXISTS ma_update ON public.mission_assignments;
DROP POLICY IF EXISTS ma_delete ON public.mission_assignments;

CREATE POLICY ma_select ON public.mission_assignments
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
    OR public.is_mission_creator(mission_id, auth.uid())
  );

CREATE POLICY ma_insert ON public.mission_assignments
  FOR INSERT
  WITH CHECK (public.can_manage_mission_assignments(mission_id, auth.uid()));

CREATE POLICY ma_update ON public.mission_assignments
  FOR UPDATE
  USING (public.can_manage_mission_assignments(mission_id, auth.uid()))
  WITH CHECK (public.can_manage_mission_assignments(mission_id, auth.uid()));

CREATE POLICY ma_delete ON public.mission_assignments
  FOR DELETE
  USING (public.can_manage_mission_assignments(mission_id, auth.uid()));
