-- Engagement invites: shareable invitation links for leaders
CREATE TABLE public.engagement_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  title TEXT,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by UUID NOT NULL,
  invited_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_engagement_invites_engagement ON public.engagement_invites(engagement_id);
CREATE INDEX idx_engagement_invites_email ON public.engagement_invites(lower(email));

GRANT SELECT, INSERT, UPDATE ON public.engagement_invites TO authenticated;
GRANT ALL ON public.engagement_invites TO service_role;

ALTER TABLE public.engagement_invites ENABLE ROW LEVEL SECURITY;

-- Leadership can view + create + revoke invites for their engagement
CREATE POLICY invites_select_leadership ON public.engagement_invites
  FOR SELECT TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder'::text, 'pm'::text, 'engagement_lead'::text]));

CREATE POLICY invites_insert_leadership ON public.engagement_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_engagement_role(engagement_id, ARRAY['founder'::text, 'pm'::text, 'engagement_lead'::text])
    AND invited_by = auth.uid()
  );

CREATE POLICY invites_update_leadership ON public.engagement_invites
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder'::text, 'pm'::text, 'engagement_lead'::text]));
