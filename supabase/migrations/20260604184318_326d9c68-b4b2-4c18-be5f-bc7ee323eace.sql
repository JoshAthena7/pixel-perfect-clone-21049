
CREATE TABLE public.atlas_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  role_hint TEXT,
  notes TEXT,
  contract_signed BOOLEAN NOT NULL DEFAULT false,
  contract_signed_at TIMESTAMPTZ,
  contract_signed_by UUID REFERENCES auth.users(id),
  invite_sent_at TIMESTAMPTZ,
  invite_sent_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'awaiting_contract',
  invited_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_invites TO authenticated;
GRANT ALL ON public.atlas_invites TO service_role;

ALTER TABLE public.atlas_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage invites"
  ON public.atlas_invites
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_atlas_invites_updated_at
  BEFORE UPDATE ON public.atlas_invites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
