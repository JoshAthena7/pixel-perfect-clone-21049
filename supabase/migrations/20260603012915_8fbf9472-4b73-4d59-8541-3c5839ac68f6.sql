
-- RFP amendments + per-change records
CREATE TABLE public.rfp_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  document_id uuid NOT NULL,
  base_rfp_document_id uuid,
  amendment_type text NOT NULL,
  status text NOT NULL DEFAULT 'analyzing',
  summary text,
  total_changes integer NOT NULL DEFAULT 0,
  critical_changes integer NOT NULL DEFAULT 0,
  analyzed_at timestamptz,
  analyzed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  error_message text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfp_amendments TO authenticated;
GRANT ALL ON public.rfp_amendments TO service_role;

ALTER TABLE public.rfp_amendments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ra_select ON public.rfp_amendments FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));
CREATE POLICY ra_write_members ON public.rfp_amendments FOR ALL TO authenticated
  USING (is_mission_member(mission_id, auth.uid()))
  WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE INDEX idx_rfp_amendments_mission ON public.rfp_amendments(mission_id, created_at DESC);

CREATE TABLE public.amendment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amendment_id uuid NOT NULL REFERENCES public.rfp_amendments(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL,
  change_type text NOT NULL,
  severity text NOT NULL DEFAULT 'significant',
  description text NOT NULL,
  affected_sections text[] DEFAULT '{}',
  affected_question_ids uuid[] DEFAULT '{}',
  writer_action_required text,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.amendment_changes TO authenticated;
GRANT ALL ON public.amendment_changes TO service_role;

ALTER TABLE public.amendment_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY ac_changes_select ON public.amendment_changes FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));
CREATE POLICY ac_changes_write ON public.amendment_changes FOR ALL TO authenticated
  USING (is_mission_member(mission_id, auth.uid()))
  WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE INDEX idx_amendment_changes_mission ON public.amendment_changes(mission_id, severity);
CREATE INDEX idx_amendment_changes_amendment ON public.amendment_changes(amendment_id);
CREATE INDEX idx_amendment_changes_question_ids ON public.amendment_changes USING GIN(affected_question_ids);
