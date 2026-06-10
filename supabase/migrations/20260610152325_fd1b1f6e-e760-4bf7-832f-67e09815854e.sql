-- Sprint 9: enable realtime + fix notification visibility so writers (atlas_team_members)
-- can read their own notifications + helpful index.

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.atlas_notifications;
ALTER TABLE public.atlas_notifications REPLICA IDENTITY FULL;

-- Helper: map auth.uid() to the user's atlas_team_members.id via email
CREATE OR REPLACE FUNCTION public.current_atlas_member_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT atm.id
  FROM public.atlas_team_members atm
  JOIN auth.users u ON lower(u.email) = lower(atm.email)
  WHERE u.id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_atlas_member_id() TO authenticated, anon, service_role;

-- Broaden SELECT policy: allow users to read notifications addressed to them
-- via auth.uid OR via their atlas_team_members.id, plus admin-role notifications.
DROP POLICY IF EXISTS "Admins can read all admin notifications" ON public.atlas_notifications;
CREATE POLICY "Users can read their notifications"
ON public.atlas_notifications
FOR SELECT
USING (
  ((recipient_role = 'admin') AND public.has_role(auth.uid(), 'admin'::public.app_role))
  OR (recipient_id = auth.uid())
  OR (recipient_id = public.current_atlas_member_id())
);

-- Broaden UPDATE policy: same recipients can mark as read
DROP POLICY IF EXISTS "Admins can mark notifications read" ON public.atlas_notifications;
CREATE POLICY "Users can mark their notifications read"
ON public.atlas_notifications
FOR UPDATE
USING (
  ((recipient_role = 'admin') AND public.has_role(auth.uid(), 'admin'::public.app_role))
  OR (recipient_id = auth.uid())
  OR (recipient_id = public.current_atlas_member_id())
)
WITH CHECK (
  ((recipient_role = 'admin') AND public.has_role(auth.uid(), 'admin'::public.app_role))
  OR (recipient_id = auth.uid())
  OR (recipient_id = public.current_atlas_member_id())
);

CREATE INDEX IF NOT EXISTS atlas_notifications_recipient_unread_idx
  ON public.atlas_notifications (recipient_id, is_read, created_at DESC);