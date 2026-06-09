CREATE TABLE public.atlas_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES public.atlas_team_members(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.atlas_activity_log TO authenticated;
GRANT ALL ON public.atlas_activity_log TO service_role;

ALTER TABLE public.atlas_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view atlas_activity_log"
  ON public.atlas_activity_log FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can insert atlas_activity_log"
  ON public.atlas_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE INDEX idx_atlas_activity_log_member_id ON public.atlas_activity_log (member_id, timestamp DESC);
