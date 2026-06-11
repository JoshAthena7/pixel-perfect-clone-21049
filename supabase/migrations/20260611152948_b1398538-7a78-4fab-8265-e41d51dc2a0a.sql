
CREATE TABLE public.draft_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.mission_questions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  requirements_score INTEGER CHECK (requirements_score >= 0 AND requirements_score <= 30),
  win_theme_score INTEGER CHECK (win_theme_score >= 0 AND win_theme_score <= 25),
  evidence_score INTEGER CHECK (evidence_score >= 0 AND evidence_score <= 20),
  style_score INTEGER CHECK (style_score >= 0 AND style_score <= 15),
  conciseness_score INTEGER CHECK (conciseness_score >= 0 AND conciseness_score <= 10),
  requirements_explanation TEXT,
  win_theme_explanation TEXT,
  evidence_explanation TEXT,
  style_explanation TEXT,
  conciseness_explanation TEXT,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  iris_recommendation TEXT,
  draft_word_count INTEGER,
  scoring_mode TEXT NOT NULL DEFAULT 'full' CHECK (scoring_mode IN ('full','quick')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_draft_scores_mission ON public.draft_scores(mission_id, created_at DESC);
CREATE INDEX idx_draft_scores_user_mission ON public.draft_scores(user_id, mission_id, created_at DESC);
CREATE INDEX idx_draft_scores_question ON public.draft_scores(question_id, created_at DESC) WHERE question_id IS NOT NULL;

GRANT SELECT, INSERT ON public.draft_scores TO authenticated;
GRANT ALL ON public.draft_scores TO service_role;

ALTER TABLE public.draft_scores ENABLE ROW LEVEL SECURITY;

-- Author can read their own scores
CREATE POLICY "Users can read their own draft scores"
ON public.draft_scores FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Platform admins can read every score
CREATE POLICY "Admins can read all draft scores"
ON public.draft_scores FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Engagement leads on a mission can read all scores on that mission
CREATE POLICY "Engagement leads can read mission draft scores"
ON public.draft_scores FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.mission_team_members mtm
    WHERE mtm.mission_id = draft_scores.mission_id
      AND mtm.member_id = auth.uid()
      AND mtm.mission_role = 'engagement_lead'
  )
);

-- Author can insert their own scores
CREATE POLICY "Users can insert their own draft scores"
ON public.draft_scores FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
