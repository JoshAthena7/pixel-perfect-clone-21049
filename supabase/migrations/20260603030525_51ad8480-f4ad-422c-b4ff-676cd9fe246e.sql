
CREATE TABLE public.iris_corrections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid NOT NULL,
  question_id uuid,
  iris_content_type text NOT NULL,
  iris_content_block text NOT NULL,
  incorrect_text text NOT NULL,
  correct_text text NOT NULL,
  criticality text NOT NULL DEFAULT 'critical',
  scope text NOT NULL DEFAULT 'global',
  flagged_by uuid,
  flagged_at timestamptz NOT NULL DEFAULT now(),
  memory_id uuid,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);

CREATE INDEX idx_iris_corrections_mission ON public.iris_corrections(mission_id);
CREATE INDEX idx_iris_corrections_question ON public.iris_corrections(question_id);
CREATE INDEX idx_iris_corrections_memory ON public.iris_corrections(memory_id);
CREATE INDEX idx_iris_corrections_flagged_at ON public.iris_corrections(flagged_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iris_corrections TO authenticated;
GRANT ALL ON public.iris_corrections TO service_role;

ALTER TABLE public.iris_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY ic_select ON public.iris_corrections
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY ic_insert ON public.iris_corrections
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_mission_member(mission_id, auth.uid())
    AND flagged_by = auth.uid()
  );

CREATE POLICY ic_update_leads ON public.iris_corrections
  FOR UPDATE TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

CREATE POLICY ic_delete_leads ON public.iris_corrections
  FOR DELETE TO authenticated
  USING (public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));
