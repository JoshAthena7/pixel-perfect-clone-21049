
-- Mission intelligence profile fields
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS program_type text,
  ADD COLUMN IF NOT EXISTS win_themes text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS priority_topics text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS competitors text[] DEFAULT '{}'::text[];

-- Category tag on market intelligence
ALTER TABLE public.market_intelligence
  ADD COLUMN IF NOT EXISTS category text;

-- Per-mission relevance scores
CREATE TABLE IF NOT EXISTS public.mission_intelligence_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  intelligence_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  matched_themes text[] DEFAULT '{}'::text[],
  matched_questions text[] DEFAULT '{}'::text[],
  iris_insight text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, intelligence_id)
);

CREATE INDEX IF NOT EXISTS mis_mission_score_idx
  ON public.mission_intelligence_scores (mission_id, score DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_intelligence_scores TO authenticated;
GRANT ALL ON public.mission_intelligence_scores TO service_role;

ALTER TABLE public.mission_intelligence_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY mis_select_members ON public.mission_intelligence_scores
  FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY mis_write_members ON public.mission_intelligence_scores
  FOR ALL TO authenticated
  USING (is_mission_member(mission_id, auth.uid()))
  WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE TRIGGER mis_touch_updated_at
  BEFORE UPDATE ON public.mission_intelligence_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
