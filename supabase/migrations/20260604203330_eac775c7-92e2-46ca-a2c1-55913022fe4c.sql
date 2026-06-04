
-- Enum
DO $$ BEGIN
  CREATE TYPE public.briefing_type AS ENUM ('global', 'direct');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Briefings
CREATE TABLE public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.briefing_type NOT NULL,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sender_name text NOT NULL,
  sender_role text,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject varchar(255) NOT NULL,
  body text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT briefings_direct_has_recipient CHECK (
    (type = 'direct' AND recipient_id IS NOT NULL)
    OR (type = 'global' AND recipient_id IS NULL)
  )
);

GRANT SELECT, INSERT ON public.briefings TO authenticated;
GRANT ALL ON public.briefings TO service_role;

ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;

-- Admins see everything
CREATE POLICY "Admins can read all briefings"
  ON public.briefings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users see globals + their direct briefings
CREATE POLICY "Users can read their briefings"
  ON public.briefings FOR SELECT
  TO authenticated
  USING (
    is_deleted = false
    AND (type = 'global' OR recipient_id = auth.uid())
  );

-- Only admins can send
CREATE POLICY "Admins can create briefings"
  ON public.briefings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND sender_id = auth.uid()
  );

CREATE INDEX briefings_recipient_idx ON public.briefings(recipient_id) WHERE recipient_id IS NOT NULL;
CREATE INDEX briefings_type_sent_idx ON public.briefings(type, sent_at DESC);

-- Acknowledgments
CREATE TABLE public.briefing_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id uuid NOT NULL REFERENCES public.briefings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  ip_address varchar(45),
  UNIQUE (briefing_id, user_id)
);

GRANT SELECT, INSERT ON public.briefing_acknowledgments TO authenticated;
GRANT ALL ON public.briefing_acknowledgments TO service_role;

ALTER TABLE public.briefing_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all acknowledgments"
  ON public.briefing_acknowledgments FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can read their own acknowledgments"
  ON public.briefing_acknowledgments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- A user may ack any briefing they can see (RLS on briefings does the visibility check)
CREATE POLICY "Users can ack visible briefings"
  ON public.briefing_acknowledgments FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.briefings b
      WHERE b.id = briefing_id
        AND b.is_deleted = false
        AND (b.type = 'global' OR b.recipient_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE INDEX briefing_acks_user_idx ON public.briefing_acknowledgments(user_id);
CREATE INDEX briefing_acks_briefing_idx ON public.briefing_acknowledgments(briefing_id);
