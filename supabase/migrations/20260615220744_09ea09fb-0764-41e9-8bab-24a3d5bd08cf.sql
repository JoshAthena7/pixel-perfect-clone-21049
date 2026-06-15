CREATE TABLE IF NOT EXISTS public.mission_proof_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  text text NOT NULL,
  source text,
  signal_authority text DEFAULT 'team_validated'
    CHECK (signal_authority IN ('client_stated', 'team_validated', 'iris_suggested')),
  is_manually_added boolean NOT NULL DEFAULT false,
  iris_confidence numeric,
  iris_sources jsonb DEFAULT '[]'::jsonb,
  graph_node_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_proof_points_mission_id
  ON public.mission_proof_points(mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_proof_points TO authenticated;
GRANT ALL ON public.mission_proof_points TO service_role;

ALTER TABLE public.mission_proof_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view mission proof points"
  ON public.mission_proof_points FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_team_members
      WHERE mission_team_members.mission_id = mission_proof_points.mission_id
        AND mission_team_members.member_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Team members can insert mission proof points"
  ON public.mission_proof_points FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mission_team_members
      WHERE mission_team_members.mission_id = mission_proof_points.mission_id
        AND mission_team_members.member_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Team members can update mission proof points"
  ON public.mission_proof_points FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_team_members
      WHERE mission_team_members.mission_id = mission_proof_points.mission_id
        AND mission_team_members.member_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Team members can delete mission proof points"
  ON public.mission_proof_points FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_team_members
      WHERE mission_team_members.mission_id = mission_proof_points.mission_id
        AND mission_team_members.member_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER update_mission_proof_points_updated_at
  BEFORE UPDATE ON public.mission_proof_points
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();