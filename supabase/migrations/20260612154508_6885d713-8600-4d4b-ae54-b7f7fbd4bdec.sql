
CREATE TABLE public.thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  sender_id uuid,
  sender_name text NOT NULL,
  message_body text NOT NULL,
  message_type text NOT NULL DEFAULT 'regular' CHECK (message_type IN ('regular','decision','iris','system')),
  iris_action text CHECK (iris_action IN ('recommend_expert','surface_intelligence','flag_conflict')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_thread_messages_question ON public.thread_messages(question_id, created_at);
CREATE INDEX idx_thread_messages_mission ON public.thread_messages(mission_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_messages TO authenticated;
GRANT ALL ON public.thread_messages TO service_role;

ALTER TABLE public.thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_messages_select_member"
  ON public.thread_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "thread_messages_insert_member"
  ON public.thread_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_mission_member(mission_id, auth.uid()));

CREATE TABLE public.oracle_thread_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  thread_message_id uuid REFERENCES public.thread_messages(id) ON DELETE SET NULL,
  query_topic text NOT NULL,
  oracle_items_returned jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_oracle_thread_queries_question ON public.oracle_thread_queries(question_id, created_at DESC);

GRANT SELECT, INSERT ON public.oracle_thread_queries TO authenticated;
GRANT ALL ON public.oracle_thread_queries TO service_role;

ALTER TABLE public.oracle_thread_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oracle_thread_queries_select_member"
  ON public.oracle_thread_queries FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "oracle_thread_queries_insert_member"
  ON public.oracle_thread_queries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_mission_member(mission_id, auth.uid()));
