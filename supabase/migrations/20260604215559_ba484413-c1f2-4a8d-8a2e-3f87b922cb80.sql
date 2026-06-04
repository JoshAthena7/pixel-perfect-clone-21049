
-- 1. Drop unused Signals system
DROP TABLE IF EXISTS public.signal_pins CASCADE;
DROP TABLE IF EXISTS public.signal_messages CASCADE;
DROP TABLE IF EXISTS public.signal_thread_participants CASCADE;
DROP TABLE IF EXISTS public.signal_threads CASCADE;
DROP FUNCTION IF EXISTS public.is_signal_thread_participant(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.signal_messages_bump_thread() CASCADE;

-- 2. Profile flag for first-use modal ack
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_acked_threads_internal_at TIMESTAMPTZ;

-- 3. Object type enum
DO $$ BEGIN
  CREATE TYPE public.thread_object_type AS ENUM
    ('question_record', 'deliverable', 'iris_output', 'milestone');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. threads
CREATE TABLE public.threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type public.thread_object_type NOT NULL,
  object_id uuid NOT NULL,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_type, object_id)
);
CREATE INDEX idx_threads_mission ON public.threads(mission_id);

GRANT SELECT, INSERT, UPDATE ON public.threads TO authenticated;
GRANT ALL ON public.threads TO service_role;
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;

-- 5. comments
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  is_iris_reply boolean NOT NULL DEFAULT false,
  anchor_text varchar(500),
  anchor_offset integer,
  version_tag varchar(20),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_thread_created ON public.comments(thread_id, created_at);

GRANT SELECT, INSERT, UPDATE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 6. mentions
CREATE TABLE public.mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  mentioned_user uuid,
  is_iris boolean NOT NULL DEFAULT false,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (is_iris OR mentioned_user IS NOT NULL)
);
CREATE INDEX idx_mentions_user_unread ON public.mentions(mentioned_user, is_read);
CREATE INDEX idx_mentions_comment ON public.mentions(comment_id);

GRANT SELECT, INSERT, UPDATE ON public.mentions TO authenticated;
GRANT ALL ON public.mentions TO service_role;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- 7. comment_resolutions
CREATE TABLE public.comment_resolutions (
  thread_id uuid PRIMARY KEY REFERENCES public.threads(id) ON DELETE CASCADE,
  resolved_by uuid NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  reopened_by uuid,
  reopened_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comment_resolutions TO authenticated;
GRANT ALL ON public.comment_resolutions TO service_role;
ALTER TABLE public.comment_resolutions ENABLE ROW LEVEL SECURITY;

-- 8. Security definer helper: can user access this thread?
CREATE OR REPLACE FUNCTION public.has_thread_access(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.threads t
    WHERE t.id = _thread_id
      AND (
        public.has_role(_user_id, 'admin'::app_role)
        OR public.is_mission_member(t.mission_id, _user_id)
      )
  )
$$;

-- 9. RLS policies

-- threads
CREATE POLICY "threads_select_access" ON public.threads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_mission_member(mission_id, auth.uid())
  );

CREATE POLICY "threads_insert_member" ON public.threads
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.is_mission_member(mission_id, auth.uid())
    )
  );

-- comments
CREATE POLICY "comments_select_access" ON public.comments
  FOR SELECT TO authenticated
  USING (public.has_thread_access(thread_id, auth.uid()));

CREATE POLICY "comments_insert_access" ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND public.has_thread_access(thread_id, auth.uid())
    AND is_iris_reply = false
  );

CREATE POLICY "comments_update_author_or_admin" ON public.comments
  FOR UPDATE TO authenticated
  USING (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- mentions
CREATE POLICY "mentions_select_access" ON public.mentions
  FOR SELECT TO authenticated
  USING (
    mentioned_user = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.id = mentions.comment_id
        AND public.has_thread_access(c.thread_id, auth.uid())
    )
  );

CREATE POLICY "mentions_insert_access" ON public.mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comments c
      WHERE c.id = mentions.comment_id
        AND c.author_id = auth.uid()
    )
  );

CREATE POLICY "mentions_update_own" ON public.mentions
  FOR UPDATE TO authenticated
  USING (mentioned_user = auth.uid())
  WITH CHECK (mentioned_user = auth.uid());

-- comment_resolutions
CREATE POLICY "resolutions_select_access" ON public.comment_resolutions
  FOR SELECT TO authenticated
  USING (public.has_thread_access(thread_id, auth.uid()));

CREATE POLICY "resolutions_insert_access" ON public.comment_resolutions
  FOR INSERT TO authenticated
  WITH CHECK (
    resolved_by = auth.uid()
    AND public.has_thread_access(thread_id, auth.uid())
  );

CREATE POLICY "resolutions_update_access" ON public.comment_resolutions
  FOR UPDATE TO authenticated
  USING (public.has_thread_access(thread_id, auth.uid()))
  WITH CHECK (public.has_thread_access(thread_id, auth.uid()));

CREATE POLICY "resolutions_delete_access" ON public.comment_resolutions
  FOR DELETE TO authenticated
  USING (public.has_thread_access(thread_id, auth.uid()));
