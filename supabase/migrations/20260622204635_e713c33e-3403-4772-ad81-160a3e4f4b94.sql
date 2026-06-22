
-- 1. mission_phases
CREATE TABLE IF NOT EXISTS public.mission_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  phase_name text NOT NULL,
  phase_order int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('done','active','pending')),
  owner uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, phase_order)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_phases TO authenticated;
GRANT ALL ON public.mission_phases TO service_role;

ALTER TABLE public.mission_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mission_phases readable by mission members"
  ON public.mission_phases FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_mission_team_member(mission_id, auth.uid())
    OR is_mission_creator(mission_id, auth.uid())
  );

CREATE POLICY "mission_phases writable by admins and mission leads"
  ON public.mission_phases FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_mission_creator(mission_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.mission_team_members m
      WHERE m.mission_id = mission_phases.mission_id
        AND m.member_id = auth.uid()
        AND m.mission_role IN ('engagement_lead','project_manager','lead','admin')
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_mission_creator(mission_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.mission_team_members m
      WHERE m.mission_id = mission_phases.mission_id
        AND m.member_id = auth.uid()
        AND m.mission_role IN ('engagement_lead','project_manager','lead','admin')
    )
  );

CREATE TRIGGER trg_mission_phases_updated_at
BEFORE UPDATE ON public.mission_phases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_mission_phases_mission ON public.mission_phases(mission_id, phase_order);

-- 2. Confidence columns on missions
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS confidence_score_trend numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_score_updated_at timestamptz;
