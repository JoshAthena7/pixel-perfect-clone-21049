
CREATE TABLE IF NOT EXISTS public.mission_trivia_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_date date NOT NULL DEFAULT CURRENT_DATE,
  question_text text NOT NULL,
  answer_given text NOT NULL,
  correct_answer text NOT NULL,
  is_correct boolean NOT NULL,
  points_earned integer NOT NULL DEFAULT 0,
  streak_day integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, user_id, question_date)
);

CREATE INDEX IF NOT EXISTS idx_trivia_mission ON public.mission_trivia_scores(mission_id, question_date DESC);
CREATE INDEX IF NOT EXISTS idx_trivia_user ON public.mission_trivia_scores(user_id, mission_id);
CREATE INDEX IF NOT EXISTS idx_trivia_leaderboard ON public.mission_trivia_scores(mission_id, is_correct, points_earned DESC);

GRANT SELECT, INSERT ON public.mission_trivia_scores TO authenticated;
GRANT ALL ON public.mission_trivia_scores TO service_role;

ALTER TABLE public.mission_trivia_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read trivia scores"
ON public.mission_trivia_scores FOR SELECT
TO authenticated
USING (public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "Users can insert their own trivia answers"
ON public.mission_trivia_scores FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_mission_team_member(mission_id, auth.uid())
);

-- Leaderboard RPC
CREATE OR REPLACE FUNCTION public.get_trivia_leaderboard(
  p_mission_id uuid,
  p_window text DEFAULT 'all'
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  total_points bigint,
  correct_answers bigint,
  total_answers bigint,
  accuracy_pct numeric,
  best_streak integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    p.display_name,
    p.email,
    COALESCE(SUM(mts.points_earned), 0)::bigint AS total_points,
    COUNT(*) FILTER (WHERE mts.is_correct)::bigint AS correct_answers,
    COUNT(mts.id)::bigint AS total_answers,
    ROUND(
      COUNT(*) FILTER (WHERE mts.is_correct)::numeric
      / NULLIF(COUNT(mts.id), 0) * 100
    ) AS accuracy_pct,
    COALESCE(MAX(mts.streak_day), 0)::int AS best_streak
  FROM public.mission_trivia_scores mts
  JOIN public.profiles p ON p.id = mts.user_id
  WHERE mts.mission_id = p_mission_id
    AND public.is_mission_team_member(p_mission_id, auth.uid())
    AND (
      p_window = 'all'
      OR (p_window = 'week' AND mts.question_date >= CURRENT_DATE - 7)
      OR (p_window = 'today' AND mts.question_date = CURRENT_DATE)
    )
  GROUP BY p.id, p.display_name, p.email
  ORDER BY total_points DESC, correct_answers DESC
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.get_trivia_leaderboard(uuid, text) TO authenticated;
