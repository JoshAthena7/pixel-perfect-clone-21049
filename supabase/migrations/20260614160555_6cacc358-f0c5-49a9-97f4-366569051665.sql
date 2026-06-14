
DROP POLICY IF EXISTS "atlas_avatars_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "atlas_resumes_auth_insert" ON storage.objects;

CREATE OR REPLACE FUNCTION public.is_mission_member(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = _mission_id AND m.created_by = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.mission_team_members mtm
      JOIN public.atlas_team_members atm ON atm.id = mtm.member_id
      JOIN auth.users u ON lower(u.email) = lower(atm.email)
      WHERE mtm.mission_id = _mission_id AND u.id = _user_id
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_mission_role(_mission_id uuid, _user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.mission_team_members mtm
      JOIN public.atlas_team_members atm ON atm.id = mtm.member_id
      JOIN auth.users u ON lower(u.email) = lower(atm.email)
      WHERE mtm.mission_id = _mission_id
        AND u.id = _user_id
        AND mtm.mission_role = ANY(_roles)
    );
$function$;

DO $$
DECLARE
  b text;
BEGIN
  FOREACH b IN ARRAY ARRAY['mission-documents','compliance-docs','mission-logos'] LOOP
    EXECUTE format($p$DROP POLICY IF EXISTS "%1$s members select" ON storage.objects$p$, b);
    EXECUTE format($p$DROP POLICY IF EXISTS "%1$s members insert" ON storage.objects$p$, b);
    EXECUTE format($p$DROP POLICY IF EXISTS "%1$s members update" ON storage.objects$p$, b);
    EXECUTE format($p$DROP POLICY IF EXISTS "%1$s members delete" ON storage.objects$p$, b);

    EXECUTE format($p$
      CREATE POLICY "%1$s members select" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = %1$L
        AND public.is_mission_member(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
      )
    $p$, b);

    EXECUTE format($p$
      CREATE POLICY "%1$s members insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = %1$L
        AND public.is_mission_member(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
      )
    $p$, b);

    EXECUTE format($p$
      CREATE POLICY "%1$s members update" ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = %1$L
        AND public.is_mission_member(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
      )
      WITH CHECK (
        bucket_id = %1$L
        AND public.is_mission_member(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
      )
    $p$, b);

    EXECUTE format($p$
      CREATE POLICY "%1$s members delete" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = %1$L
        AND public.is_mission_member(NULLIF((storage.foldername(name))[1], '')::uuid, auth.uid())
      )
    $p$, b);
  END LOOP;
END$$;
