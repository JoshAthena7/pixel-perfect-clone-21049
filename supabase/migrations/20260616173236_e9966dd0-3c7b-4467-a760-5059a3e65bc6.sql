-- ============================================================
-- atlas_mission_moments  (Inspiration / Trivia / Teamwork Nudges)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.atlas_mission_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  moment_type text NOT NULL CHECK (moment_type IN ('inspiration','trivia','teamwork_nudge')),
  content jsonb NOT NULL,
  active_date date NOT NULL DEFAULT CURRENT_DATE,
  generated_by text DEFAULT 'iris',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_amm_mission_date
  ON public.atlas_mission_moments(mission_id, active_date, moment_type);

-- One row per mission/type/day (lazy generation idempotency)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_amm_mission_type_date
  ON public.atlas_mission_moments(mission_id, moment_type, active_date);

GRANT SELECT ON public.atlas_mission_moments TO authenticated;
GRANT ALL ON public.atlas_mission_moments TO service_role;

ALTER TABLE public.atlas_mission_moments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission team can read moments"
  ON public.atlas_mission_moments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = atlas_mission_moments.mission_id
        AND m.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.mission_team_members tm
      WHERE tm.mission_id = atlas_mission_moments.mission_id
        AND tm.member_id = auth.uid()
    )
  );

-- Inserts/updates only via service_role (cron + server fns using admin client)
-- No INSERT/UPDATE policies for authenticated users.

-- ============================================================
-- atlas_shoutouts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.atlas_shoutouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) > 0 AND char_length(message) <= 200),
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shout_to ON public.atlas_shoutouts(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shout_mission ON public.atlas_shoutouts(mission_id, created_at DESC);

GRANT SELECT, INSERT ON public.atlas_shoutouts TO authenticated;
GRANT ALL ON public.atlas_shoutouts TO service_role;

ALTER TABLE public.atlas_shoutouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read shoutouts you're part of"
  ON public.atlas_shoutouts FOR SELECT
  TO authenticated
  USING (
    auth.uid() = from_user_id
    OR auth.uid() = to_user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = atlas_shoutouts.mission_id
        AND m.created_by = auth.uid()
    )
  );

CREATE POLICY "Send your own shoutouts"
  ON public.atlas_shoutouts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = from_user_id
    AND from_user_id <> to_user_id
  );

-- Enable realtime for shoutout toasts
ALTER PUBLICATION supabase_realtime ADD TABLE public.atlas_shoutouts;

-- ============================================================
-- atlas_writer_block_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.atlas_writer_block_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE SET NULL,
  block_type text NOT NULL CHECK (block_type IN (
    'dont_know_where_to_start',
    'have_ideas_cant_organize',
    'sounds_generic',
    'know_what_not_how'
  )),
  iris_response jsonb,
  was_helpful boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_awb_user ON public.atlas_writer_block_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_awb_mission ON public.atlas_writer_block_sessions(mission_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.atlas_writer_block_sessions TO authenticated;
GRANT ALL ON public.atlas_writer_block_sessions TO service_role;

ALTER TABLE public.atlas_writer_block_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Writers see their own sessions"
  ON public.atlas_writer_block_sessions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Writers create their own sessions"
  ON public.atlas_writer_block_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Writers update their own sessions"
  ON public.atlas_writer_block_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);