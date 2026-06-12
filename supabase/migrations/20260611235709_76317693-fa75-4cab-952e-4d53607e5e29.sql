CREATE TABLE public.evaluator_pictures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT NOT NULL DEFAULT 'IRIS',
  rfp_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  prior_procurement_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  public_record_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  political_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  named_individual_signals JSONB NOT NULL DEFAULT '[]'::jsonb,
  inferred_panel_mindset TEXT,
  inferred_pressures JSONB NOT NULL DEFAULT '[]'::jsonb,
  inferred_fears JSONB NOT NULL DEFAULT '[]'::jsonb,
  inferred_defensibility_needs JSONB NOT NULL DEFAULT '[]'::jsonb,
  scoring_lens TEXT,
  what_iris_does_not_know TEXT,
  how_to_fill_gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  question_snapshots JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence_overall TEXT NOT NULL DEFAULT 'low' CHECK (confidence_overall IN ('high','medium','low')),
  one_sentence_bottom_line TEXT,
  signals_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT evaluator_pictures_mission_unique UNIQUE (mission_id)
);

CREATE INDEX idx_evaluator_pictures_mission_id ON public.evaluator_pictures(mission_id);
CREATE INDEX idx_evaluator_pictures_generated_at ON public.evaluator_pictures(generated_at DESC);

GRANT SELECT ON public.evaluator_pictures TO authenticated;
GRANT ALL ON public.evaluator_pictures TO service_role;

ALTER TABLE public.evaluator_pictures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read evaluator picture"
  ON public.evaluator_pictures
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_mission_team_member(mission_id, auth.uid())
    OR public.is_mission_creator(mission_id, auth.uid())
  );

CREATE POLICY "Admins can insert evaluator picture"
  ON public.evaluator_pictures
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update evaluator picture"
  ON public.evaluator_pictures
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_evaluator_pictures_updated_at
  BEFORE UPDATE ON public.evaluator_pictures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();