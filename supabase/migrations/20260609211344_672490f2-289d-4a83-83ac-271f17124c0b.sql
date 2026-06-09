CREATE TABLE IF NOT EXISTS public.atlas_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_role text NOT NULL CHECK (recipient_role IN ('admin','specific_user')),
  recipient_id uuid,
  type text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.atlas_notifications TO authenticated;
GRANT ALL ON public.atlas_notifications TO service_role;

ALTER TABLE public.atlas_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all admin notifications"
  ON public.atlas_notifications FOR SELECT
  TO authenticated
  USING (
    (recipient_role = 'admin' AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (recipient_role = 'specific_user' AND recipient_id = auth.uid())
  );

CREATE POLICY "Admins can mark notifications read"
  ON public.atlas_notifications FOR UPDATE
  TO authenticated
  USING (
    (recipient_role = 'admin' AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (recipient_role = 'specific_user' AND recipient_id = auth.uid())
  )
  WITH CHECK (
    (recipient_role = 'admin' AND public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (recipient_role = 'specific_user' AND recipient_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_atlas_notifications_recipient
  ON public.atlas_notifications (recipient_role, is_read, created_at DESC);