
-- ============================================================
-- NEW-1: mission-library storage UPDATE membership check
-- ============================================================
DROP POLICY IF EXISTS mission_library_storage_update ON storage.objects;

CREATE POLICY ml_files_update_members
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'mission-library'
  AND public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
)
WITH CHECK (
  bucket_id = 'mission-library'
  AND public.is_mission_member((split_part(name, '/', 1))::uuid, auth.uid())
);

-- ============================================================
-- NEW-2: Mission-scoped Realtime topic membership gate
--   Topic conventions gated here (defense-in-depth on top of
--   per-row RLS that already applies to postgres_changes):
--     mission:<uuid>:*       -> require is_mission_member
--     engagement:<uuid>:*    -> require private.is_engagement_member
--     presence:mission:*     -> require is_mission_member
--   Platform admins may subscribe to any topic.
-- realtime.messages is default-deny; only matching permissive
-- policies allow a subscription.
-- ============================================================

-- Admin override (SELECT + INSERT cover subscribe + broadcast)
DROP POLICY IF EXISTS realtime_admin_all_select ON realtime.messages;
CREATE POLICY realtime_admin_all_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS realtime_admin_all_insert ON realtime.messages;
CREATE POLICY realtime_admin_all_insert
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- mission:<uuid>:* gate
DROP POLICY IF EXISTS realtime_mission_topic_select ON realtime.messages;
CREATE POLICY realtime_mission_topic_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'mission:%'
  AND public.is_mission_member(
    (NULLIF(split_part(realtime.topic(), ':', 2), ''))::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS realtime_mission_topic_insert ON realtime.messages;
CREATE POLICY realtime_mission_topic_insert
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'mission:%'
  AND public.is_mission_member(
    (NULLIF(split_part(realtime.topic(), ':', 2), ''))::uuid,
    auth.uid()
  )
);

-- presence:mission:<uuid> gate
DROP POLICY IF EXISTS realtime_presence_mission_select ON realtime.messages;
CREATE POLICY realtime_presence_mission_select
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'presence:mission:%'
  AND public.is_mission_member(
    (NULLIF(split_part(realtime.topic(), ':', 3), ''))::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS realtime_presence_mission_insert ON realtime.messages;
CREATE POLICY realtime_presence_mission_insert
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() LIKE 'presence:mission:%'
  AND public.is_mission_member(
    (NULLIF(split_part(realtime.topic(), ':', 3), ''))::uuid,
    auth.uid()
  )
);

-- ============================================================
-- NEW-3: expertise_options uses has_role() not profiles.is_platform_admin
-- ============================================================
DROP POLICY IF EXISTS "Platform admins manage expertise options" ON public.expertise_options;

CREATE POLICY expertise_options_admin_manage
ON public.expertise_options
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'DEPRECATED. Do not reference in new policies. Canonical admin check is public.has_role(auth.uid(),''admin''). Column retained only for legacy backfill compatibility; scheduled for removal once all migrations no longer reference it.';

-- ============================================================
-- NEW-4: user_has_any_leadership_role -> query mission_members
--   engagement_members table does not exist in this schema; the
--   function silently returned false for everyone, locking
--   legitimate leads out of support_requests / compliance-docs.
--   Canonical leadership roles on mission_members: admin, lead, owner.
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_has_any_leadership_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members
      WHERE user_id = _user_id
        AND role IN ('admin','lead','owner')
    );
$$;
