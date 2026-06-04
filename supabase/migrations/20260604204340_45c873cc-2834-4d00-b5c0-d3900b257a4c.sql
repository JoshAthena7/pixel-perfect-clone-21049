
-- Threads
CREATE TABLE public.signal_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('direct','group')),
  name varchar(100),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  CHECK (type = 'direct' OR (type = 'group' AND name IS NOT NULL AND length(trim(name)) > 0))
);
GRANT SELECT, INSERT, UPDATE ON public.signal_threads TO authenticated;
GRANT ALL ON public.signal_threads TO service_role;
ALTER TABLE public.signal_threads ENABLE ROW LEVEL SECURITY;

-- Participants
CREATE TABLE public.signal_thread_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.signal_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  is_archived boolean NOT NULL DEFAULT false,
  UNIQUE (thread_id, user_id)
);
CREATE INDEX idx_stp_user ON public.signal_thread_participants(user_id);
CREATE INDEX idx_stp_thread ON public.signal_thread_participants(thread_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_thread_participants TO authenticated;
GRANT ALL ON public.signal_thread_participants TO service_role;
ALTER TABLE public.signal_thread_participants ENABLE ROW LEVEL SECURITY;

-- Helper: is user a participant of thread
CREATE OR REPLACE FUNCTION public.is_signal_thread_participant(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.signal_thread_participants
    WHERE thread_id = _thread_id AND user_id = _user_id
  );
$$;

-- Signal messages (the "signals" individual entity, table renamed to avoid clash with existing public.signals)
CREATE TABLE public.signal_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.signal_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 2000),
  is_priority boolean NOT NULL DEFAULT false,
  quote_of uuid REFERENCES public.signal_messages(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  attachments jsonb
);
CREATE INDEX idx_sm_thread_sent ON public.signal_messages(thread_id, sent_at DESC);
GRANT SELECT, INSERT ON public.signal_messages TO authenticated;
GRANT ALL ON public.signal_messages TO service_role;
ALTER TABLE public.signal_messages ENABLE ROW LEVEL SECURITY;

-- Bump last_activity_at on new signal
CREATE OR REPLACE FUNCTION public.signal_messages_bump_thread()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.signal_threads SET last_activity_at = NEW.sent_at WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_signal_messages_bump
AFTER INSERT ON public.signal_messages
FOR EACH ROW EXECUTE FUNCTION public.signal_messages_bump_thread();

-- Pins (max 3 per thread)
CREATE TABLE public.signal_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id uuid NOT NULL REFERENCES public.signal_messages(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.signal_threads(id) ON DELETE CASCADE,
  pinned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, signal_id)
);
CREATE INDEX idx_sp_thread ON public.signal_pins(thread_id);
GRANT SELECT, INSERT, DELETE ON public.signal_pins TO authenticated;
GRANT ALL ON public.signal_pins TO service_role;
ALTER TABLE public.signal_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.signal_pins_enforce_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c int;
BEGIN
  SELECT count(*) INTO c FROM public.signal_pins WHERE thread_id = NEW.thread_id;
  IF c >= 3 THEN
    RAISE EXCEPTION 'Pin limit reached: a thread can have at most 3 pinned Signals';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_signal_pins_limit
BEFORE INSERT ON public.signal_pins
FOR EACH ROW EXECUTE FUNCTION public.signal_pins_enforce_limit();

-- RLS policies
-- Threads: visible to participants; insert by self
CREATE POLICY "threads_select_participant" ON public.signal_threads FOR SELECT TO authenticated
  USING (public.is_signal_thread_participant(id, auth.uid()));
CREATE POLICY "threads_insert_self" ON public.signal_threads FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "threads_update_participant" ON public.signal_threads FOR UPDATE TO authenticated
  USING (public.is_signal_thread_participant(id, auth.uid()))
  WITH CHECK (public.is_signal_thread_participant(id, auth.uid()));

-- Participants: visible to participants of same thread; users insert themselves into threads they created, and creator can add others
CREATE POLICY "stp_select_participant" ON public.signal_thread_participants FOR SELECT TO authenticated
  USING (public.is_signal_thread_participant(thread_id, auth.uid()));
CREATE POLICY "stp_insert_by_creator" ON public.signal_thread_participants FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.signal_threads t WHERE t.id = thread_id AND t.created_by = auth.uid())
  );
CREATE POLICY "stp_update_self" ON public.signal_thread_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Signal messages
CREATE POLICY "sm_select_participant" ON public.signal_messages FOR SELECT TO authenticated
  USING (public.is_signal_thread_participant(thread_id, auth.uid()));
CREATE POLICY "sm_insert_participant" ON public.signal_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_signal_thread_participant(thread_id, auth.uid())
  );

-- Pins
CREATE POLICY "sp_select_participant" ON public.signal_pins FOR SELECT TO authenticated
  USING (public.is_signal_thread_participant(thread_id, auth.uid()));
CREATE POLICY "sp_insert_participant" ON public.signal_pins FOR INSERT TO authenticated
  WITH CHECK (pinned_by = auth.uid() AND public.is_signal_thread_participant(thread_id, auth.uid()));
CREATE POLICY "sp_delete_participant" ON public.signal_pins FOR DELETE TO authenticated
  USING (public.is_signal_thread_participant(thread_id, auth.uid()));
