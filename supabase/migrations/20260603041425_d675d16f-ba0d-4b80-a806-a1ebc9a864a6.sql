
-- 1. Fix is_olympus_user: remove the dangerous fallback that grants new users elevated privileges
CREATE OR REPLACE FUNCTION public.is_olympus_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.mission_members
    WHERE user_id = _user_id AND role IN ('admin','lead')
  );
$function$;

-- 2. Remove the unrestricted self-join policy on mission_members.
-- The mm_insert_admin_or_self_creator policy already permits valid self-joins
-- (mission creators) and admin-driven adds.
DROP POLICY IF EXISTS "Users can add themselves" ON public.mission_members;

-- 3. Restrict compliance-docs bucket SELECT to leadership only
-- (matches existing insert/delete policies that already require leadership).
DROP POLICY IF EXISTS compliance_storage_select ON storage.objects;
CREATE POLICY compliance_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'compliance-docs'
  AND public.user_has_any_leadership_role(auth.uid())
);

-- 4. Tighten iris_brief_cache SELECT: drop the NULL-user-id leak.
-- Cache rows with no owner are now only readable by service_role.
DROP POLICY IF EXISTS ibc_select_self ON public.iris_brief_cache;
CREATE POLICY ibc_select_self
ON public.iris_brief_cache
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 5. Scope market_intelligence reads to mission membership
DROP POLICY IF EXISTS mi_select_auth ON public.market_intelligence;
CREATE POLICY mi_select_auth
ON public.market_intelligence
FOR SELECT
TO authenticated
USING (
  mission_id IS NULL
  OR public.is_mission_member(mission_id, auth.uid())
);

-- 6. Hide slack_webhook from authenticated SELECT.
-- Authenticated users can still SELECT every other column on missions;
-- slack_webhook is reachable only via the get_engagement_slack_webhook RPC
-- (leadership-only) and service_role.
REVOKE SELECT (slack_webhook) ON public.missions FROM authenticated;
REVOKE SELECT (slack_webhook) ON public.missions FROM anon;
