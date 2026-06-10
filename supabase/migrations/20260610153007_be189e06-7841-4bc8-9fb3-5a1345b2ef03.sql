
-- Add amendment flag to sections
ALTER TABLE public.mission_sections
  ADD COLUMN IF NOT EXISTS amendment_flagged boolean NOT NULL DEFAULT false;

-- Extend mission_qa_log
ALTER TABLE public.mission_qa_log
  ADD COLUMN IF NOT EXISTS qa_number text,
  ADD COLUMN IF NOT EXISTS state_response text,
  ADD COLUMN IF NOT EXISTS date_issued date,
  ADD COLUMN IF NOT EXISTS sections_affected uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS impact_level text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS iris_interpretation text;

-- Make client intelligence admin-only
DROP POLICY IF EXISTS admin_or_team_select_mci ON public.mission_client_intelligence;
DROP POLICY IF EXISTS admin_or_team_write_mci ON public.mission_client_intelligence;
CREATE POLICY admin_only_select_mci ON public.mission_client_intelligence
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY admin_only_write_mci ON public.mission_client_intelligence
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
