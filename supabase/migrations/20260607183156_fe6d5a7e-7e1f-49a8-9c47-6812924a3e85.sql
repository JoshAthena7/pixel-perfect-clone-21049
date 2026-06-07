-- Mission assignment on invites
ALTER TABLE public.atlas_invites
  ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS expected_start_date date,
  ADD COLUMN IF NOT EXISTS engagement_lead_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Secure onboarding tokens (72hr expiry)
CREATE TABLE IF NOT EXISTS public.atlas_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES public.atlas_invites(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_atlas_invite_tokens_invite ON public.atlas_invite_tokens(invite_id);
CREATE INDEX IF NOT EXISTS idx_atlas_invite_tokens_hash ON public.atlas_invite_tokens(token_hash);

GRANT SELECT, INSERT, UPDATE ON public.atlas_invite_tokens TO authenticated;
GRANT ALL ON public.atlas_invite_tokens TO service_role;

ALTER TABLE public.atlas_invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage invite tokens"
  ON public.atlas_invite_tokens
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));