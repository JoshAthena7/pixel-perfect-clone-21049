
-- Manager flags ("watch list" / flag-for-review on a question)
CREATE TABLE IF NOT EXISTS public.mission_manager_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  flag_reason text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mmf_mission ON public.mission_manager_flags(mission_id, resolved);
CREATE INDEX IF NOT EXISTS idx_mmf_question ON public.mission_manager_flags(question_id);
CREATE INDEX IF NOT EXISTS idx_mmf_user ON public.mission_manager_flags(flagged_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_manager_flags TO authenticated;
GRANT ALL ON public.mission_manager_flags TO service_role;

ALTER TABLE public.mission_manager_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mmf select members"
  ON public.mission_manager_flags FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_mission_member(mission_id, auth.uid()));

CREATE POLICY "mmf insert manager"
  ON public.mission_manager_flags FOR INSERT TO authenticated
  WITH CHECK (
    flagged_by = auth.uid() AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.mission_team_members tm
        WHERE tm.mission_id = mission_manager_flags.mission_id
          AND tm.member_id = auth.uid()
          AND tm.mission_role IN ('engagement_lead','project_manager','lead','Lead Writer','Proposal Manager')
      )
    )
  );

CREATE POLICY "mmf update manager"
  ON public.mission_manager_flags FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR flagged_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.mission_team_members tm
      WHERE tm.mission_id = mission_manager_flags.mission_id
        AND tm.member_id = auth.uid()
        AND tm.mission_role IN ('engagement_lead','project_manager','lead','Lead Writer','Proposal Manager')
    )
  );

CREATE POLICY "mmf delete admin"
  ON public.mission_manager_flags FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR flagged_by = auth.uid());

-- Admin health overrides log (audit + "manually set" marker)
CREATE TABLE IF NOT EXISTS public.mission_health_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  overridden_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_state text,
  new_state text NOT NULL,
  reason text NOT NULL,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mho_question ON public.mission_health_overrides(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mho_mission ON public.mission_health_overrides(mission_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_health_overrides TO authenticated;
GRANT ALL ON public.mission_health_overrides TO service_role;

ALTER TABLE public.mission_health_overrides ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write health overrides (the admin note is private)
CREATE POLICY "mho admin select"
  ON public.mission_health_overrides FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "mho admin insert"
  ON public.mission_health_overrides FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND overridden_by = auth.uid());

CREATE POLICY "mho admin update"
  ON public.mission_health_overrides FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "mho admin delete"
  ON public.mission_health_overrides FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
