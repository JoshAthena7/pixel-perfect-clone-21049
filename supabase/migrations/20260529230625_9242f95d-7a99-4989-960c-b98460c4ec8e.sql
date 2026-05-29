
-- =========================================
-- section_threads (permanent comments per section)
-- =========================================
CREATE TABLE public.section_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  section_id uuid NOT NULL,
  member_id uuid NOT NULL,
  author_name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_section_threads_section ON public.section_threads(section_id, created_at);
CREATE INDEX idx_section_threads_engagement ON public.section_threads(engagement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_threads TO authenticated;
GRANT ALL ON public.section_threads TO service_role;
ALTER TABLE public.section_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY section_threads_select_member ON public.section_threads
  FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY section_threads_insert_member ON public.section_threads
  FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id) AND member_id IN (
    SELECT id FROM public.engagement_members WHERE user_id = auth.uid() AND engagement_id = section_threads.engagement_id
  ));
CREATE POLICY section_threads_delete_own_or_lead ON public.section_threads
  FOR DELETE TO authenticated USING (
    member_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid())
    OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.section_threads;
ALTER TABLE public.section_threads REPLICA IDENTITY FULL;

-- =========================================
-- presence (heartbeat)
-- =========================================
CREATE TABLE public.presence (
  member_id uuid PRIMARY KEY,
  engagement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_presence_engagement ON public.presence(engagement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.presence TO authenticated;
GRANT ALL ON public.presence TO service_role;
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY presence_select_member ON public.presence
  FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY presence_upsert_own ON public.presence
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_engagement_member(engagement_id));
CREATE POLICY presence_update_own ON public.presence
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.presence;
ALTER TABLE public.presence REPLICA IDENTITY FULL;

-- =========================================
-- nudges
-- =========================================
CREATE TABLE public.nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  recipient_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_nudges_recipient ON public.nudges(recipient_id, read, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nudges TO authenticated;
GRANT ALL ON public.nudges TO service_role;
ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

CREATE POLICY nudges_select_party ON public.nudges
  FOR SELECT TO authenticated USING (
    sender_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid())
    OR recipient_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid())
  );
CREATE POLICY nudges_insert_sender ON public.nudges
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_engagement_member(engagement_id)
    AND sender_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid() AND engagement_id = nudges.engagement_id)
  );
CREATE POLICY nudges_update_recipient ON public.nudges
  FOR UPDATE TO authenticated USING (
    recipient_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.nudges;
ALTER TABLE public.nudges REPLICA IDENTITY FULL;

-- =========================================
-- quick_chats (ephemeral 24h DMs)
-- =========================================
CREATE TABLE public.quick_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  sender_name text NOT NULL,
  recipient_id uuid NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX idx_quick_chats_pair ON public.quick_chats(engagement_id, sender_id, recipient_id, created_at);
CREATE INDEX idx_quick_chats_expires ON public.quick_chats(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_chats TO authenticated;
GRANT ALL ON public.quick_chats TO service_role;
ALTER TABLE public.quick_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY quick_chats_select_party ON public.quick_chats
  FOR SELECT TO authenticated USING (
    expires_at > now() AND (
      sender_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid())
      OR recipient_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid())
    )
  );
CREATE POLICY quick_chats_insert_sender ON public.quick_chats
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_engagement_member(engagement_id)
    AND sender_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid() AND engagement_id = quick_chats.engagement_id)
  );
CREATE POLICY quick_chats_update_recipient ON public.quick_chats
  FOR UPDATE TO authenticated USING (
    recipient_id IN (SELECT id FROM public.engagement_members WHERE user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.quick_chats;
ALTER TABLE public.quick_chats REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.cleanup_quick_chats()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.quick_chats WHERE expires_at < now();
$$;
