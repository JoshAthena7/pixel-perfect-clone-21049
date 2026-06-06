-- ATLAS V1: add columns needed for section editor + IRIS alignment display
ALTER TABLE public.mission_sections
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS iris_alignment_pct integer,
  ADD COLUMN IF NOT EXISTS iris_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iris_flag_reason text,
  ADD COLUMN IF NOT EXISTS rfp_requirement text;

-- Allow assigned writers / SMEs to update body + status on sections assigned to them
DROP POLICY IF EXISTS "Assigned users can update their section body" ON public.mission_sections;
CREATE POLICY "Assigned users can update their section body"
  ON public.mission_sections
  FOR UPDATE
  TO authenticated
  USING (assigned_user_id = auth.uid())
  WITH CHECK (assigned_user_id = auth.uid());
