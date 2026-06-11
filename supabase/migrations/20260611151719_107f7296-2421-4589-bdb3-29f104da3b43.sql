-- Phase 1: extend app_role with engagement_lead + executive, add athena_insights table

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'engagement_lead';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'executive';

CREATE TABLE IF NOT EXISTS public.athena_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  is_daily_insight boolean NOT NULL DEFAULT false,
  quote text NOT NULL,
  writers_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athena_insights_mission ON public.athena_insights(mission_id);
CREATE INDEX IF NOT EXISTS idx_athena_insights_question ON public.athena_insights(question_id);
CREATE INDEX IF NOT EXISTS idx_athena_insights_daily ON public.athena_insights(mission_id) WHERE is_daily_insight = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athena_insights TO authenticated;
GRANT ALL ON public.athena_insights TO service_role;

ALTER TABLE public.athena_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "athena_insights_select"
  ON public.athena_insights FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
    OR public.is_mission_creator(mission_id, auth.uid())
  );

CREATE POLICY "athena_insights_admin_write"
  ON public.athena_insights FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_athena_insights_uat
  BEFORE UPDATE ON public.athena_insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();