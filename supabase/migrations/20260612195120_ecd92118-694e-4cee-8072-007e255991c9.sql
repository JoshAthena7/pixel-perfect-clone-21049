
CREATE TABLE IF NOT EXISTS public.admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  subject text NOT NULL,
  body text NOT NULL DEFAULT '',
  recipient_scope text NOT NULL DEFAULT 'all',
  recipient_ids uuid[] NOT NULL DEFAULT '{}',
  attachment_url text,
  status text NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_messages_status_check CHECK (status IN ('draft','sent')),
  CONSTRAINT admin_messages_scope_check CHECK (recipient_scope IN ('all','mission','role','individual'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_messages TO authenticated;
GRANT ALL ON public.admin_messages TO service_role;

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin messages"
  ON public.admin_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert admin messages"
  ON public.admin_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND sender_id = auth.uid());

CREATE POLICY "Admins can update admin messages"
  ON public.admin_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete admin messages"
  ON public.admin_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS admin_messages_status_idx ON public.admin_messages (status, sent_at DESC);

CREATE OR REPLACE FUNCTION public.update_admin_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_admin_messages_updated_at ON public.admin_messages;
CREATE TRIGGER update_admin_messages_updated_at
  BEFORE UPDATE ON public.admin_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_admin_messages_updated_at();
