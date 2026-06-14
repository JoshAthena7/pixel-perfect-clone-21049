CREATE TABLE IF NOT EXISTS public.oracle_escalation_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id),
  escalation_type text,
  context_summary text,
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  mission_phase text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.oracle_escalation_log
  ADD COLUMN IF NOT EXISTS pattern_note text;

ALTER TABLE public.oracle_escalation_log
  ADD COLUMN IF NOT EXISTS sos_update_id uuid;

CREATE INDEX IF NOT EXISTS oracle_escalation_log_sos_update_id_idx
  ON public.oracle_escalation_log(sos_update_id);
CREATE INDEX IF NOT EXISTS oracle_escalation_log_type_idx
  ON public.oracle_escalation_log(escalation_type);

GRANT SELECT ON public.oracle_escalation_log TO authenticated;
GRANT ALL ON public.oracle_escalation_log TO service_role;

ALTER TABLE public.oracle_escalation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view escalation log"
  ON public.oracle_escalation_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages escalation log"
  ON public.oracle_escalation_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
