-- Extend athena_insights with strategic columns
ALTER TABLE public.athena_insights
  ADD COLUMN IF NOT EXISTS strategic_quote text,
  ADD COLUMN IF NOT EXISTS why_it_matters text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS insight_number integer,
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.mission_sections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS is_iris_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insight_type text NOT NULL DEFAULT 'daily';

-- Backfill strategic_quote from legacy quote when null
UPDATE public.athena_insights SET strategic_quote = quote WHERE strategic_quote IS NULL AND quote IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_athena_insights_section ON public.athena_insights(section_id);
CREATE INDEX IF NOT EXISTS idx_athena_insights_type ON public.athena_insights(mission_id, insight_type);

-- Mappings table connecting an insight to mission/section/question scopes
CREATE TABLE IF NOT EXISTS public.athena_insight_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id uuid NOT NULL REFERENCES public.athena_insights(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.mission_sections(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'mission',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_aim_section ON public.athena_insight_mappings(section_id) WHERE section_id IS NOT NULL AND question_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_aim_mission ON public.athena_insight_mappings(mission_id);
CREATE INDEX IF NOT EXISTS idx_aim_insight ON public.athena_insight_mappings(insight_id);
CREATE INDEX IF NOT EXISTS idx_aim_question ON public.athena_insight_mappings(question_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.athena_insight_mappings TO authenticated;
GRANT ALL ON public.athena_insight_mappings TO service_role;

ALTER TABLE public.athena_insight_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aim_select"
  ON public.athena_insight_mappings
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_mission_team_member(mission_id, auth.uid())
    OR is_mission_creator(mission_id, auth.uid())
  );

CREATE POLICY "aim_admin_write"
  ON public.athena_insight_mappings
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));