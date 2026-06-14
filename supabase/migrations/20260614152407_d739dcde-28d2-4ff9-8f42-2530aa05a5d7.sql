
CREATE TABLE IF NOT EXISTS public.score_me_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  section_name text,
  response_text text,
  overall_score integer CHECK (overall_score BETWEEN 0 AND 100),
  message_discipline_score integer CHECK (message_discipline_score BETWEEN 0 AND 100),
  win_theme_alignment_score integer CHECK (win_theme_alignment_score BETWEEN 0 AND 100),
  gaps text[],
  strengths text[],
  coaching_summary text,
  scored_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.score_me_sessions TO authenticated;
GRANT ALL ON public.score_me_sessions TO service_role;

ALTER TABLE public.score_me_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert their own score me sessions"
  ON public.score_me_sessions FOR INSERT TO authenticated
  WITH CHECK (scored_by = auth.uid());

CREATE POLICY "Users view their own score me sessions"
  ON public.score_me_sessions FOR SELECT TO authenticated
  USING (scored_by = auth.uid());

CREATE INDEX IF NOT EXISTS score_me_sessions_mission_id_idx
  ON public.score_me_sessions(mission_id, created_at DESC);
