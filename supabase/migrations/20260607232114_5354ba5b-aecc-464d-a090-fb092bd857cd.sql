
-- 1) Extend question_records
ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS strategic_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_sme_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sme_meeting_status text NOT NULL DEFAULT 'not_scheduled',
  ADD COLUMN IF NOT EXISTS sme_meeting_date timestamptz,
  ADD COLUMN IF NOT EXISTS import_notes text;

-- Constrain meeting status to known values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'question_records_sme_meeting_status_check'
  ) THEN
    ALTER TABLE public.question_records
      ADD CONSTRAINT question_records_sme_meeting_status_check
      CHECK (sme_meeting_status IN ('not_scheduled','scheduled','complete','cancelled','rescheduled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_question_records_strategic_owner
  ON public.question_records(strategic_owner_id) WHERE strategic_owner_id IS NOT NULL;

-- 2) Mission staffing summary
CREATE TABLE IF NOT EXISTS public.mission_staffing_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL UNIQUE REFERENCES public.missions(id) ON DELETE CASCADE,
  unassigned_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  overloaded_writers   jsonb NOT NULL DEFAULT '[]'::jsonb,
  sections_without_owner jsonb NOT NULL DEFAULT '[]'::jsonb,
  high_risk_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_staffing_summary TO authenticated;
GRANT ALL ON public.mission_staffing_summary TO service_role;

ALTER TABLE public.mission_staffing_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members read staffing summary"
  ON public.mission_staffing_summary FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_mission_member(mission_id, auth.uid())
  );

CREATE POLICY "Mission leads/admins write staffing summary"
  ON public.mission_staffing_summary FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner'])
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead','owner'])
  );

CREATE TRIGGER trg_mission_staffing_summary_updated_at
  BEFORE UPDATE ON public.mission_staffing_summary
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
