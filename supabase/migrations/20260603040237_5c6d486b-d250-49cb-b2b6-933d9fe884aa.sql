
CREATE TABLE public.score_me_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  question_id uuid NOT NULL,
  scored_by uuid NOT NULL,
  response_text text NOT NULL,
  score numeric NOT NULL,
  projected_score numeric,
  full_analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX score_me_history_question_idx ON public.score_me_history(question_id, created_at DESC);
CREATE INDEX score_me_history_mission_idx ON public.score_me_history(mission_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.score_me_history TO authenticated;
GRANT ALL ON public.score_me_history TO service_role;

ALTER TABLE public.score_me_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "smh_select_members"
  ON public.score_me_history
  FOR SELECT
  TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY "smh_insert_self_member"
  ON public.score_me_history
  FOR INSERT
  TO authenticated
  WITH CHECK (scored_by = auth.uid() AND is_mission_member(mission_id, auth.uid()));

CREATE POLICY "smh_delete_leads"
  ON public.score_me_history
  FOR DELETE
  TO authenticated
  USING (has_mission_role(mission_id, auth.uid(), ARRAY['admin'::text, 'lead'::text]));
