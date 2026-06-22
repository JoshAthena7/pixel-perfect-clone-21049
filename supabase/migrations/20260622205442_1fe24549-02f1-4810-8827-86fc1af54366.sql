CREATE TABLE public.mission_radar_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('risk','opportunity','intelligence','readiness','stakeholder','competitive','schedule')),
  headline text NOT NULL,
  body text,
  impact numeric NOT NULL DEFAULT 0.5 CHECK (impact >= 0 AND impact <= 1),
  urgency numeric NOT NULL DEFAULT 0.5 CHECK (urgency >= 0 AND urgency <= 1),
  confidence numeric NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  proximity numeric NOT NULL DEFAULT 0.5 CHECK (proximity >= 0 AND proximity <= 1),
  score numeric NOT NULL DEFAULT 0,
  ring text NOT NULL DEFAULT 'outer' CHECK (ring IN ('inner','mid','outer')),
  severity text NOT NULL DEFAULT 'ambient' CHECK (severity IN ('critical','high','medium','ambient')),
  source_table text,
  source_id uuid,
  deep_link text,
  iris_rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decayed_at timestamptz,
  resolved_at timestamptz
);

CREATE INDEX idx_mission_radar_signals_mission ON public.mission_radar_signals(mission_id) WHERE resolved_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_radar_signals TO authenticated;
GRANT ALL ON public.mission_radar_signals TO service_role;
ALTER TABLE public.mission_radar_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read radar signals"
  ON public.mission_radar_signals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_team_members m WHERE m.mission_id = mission_radar_signals.mission_id AND m.member_id = auth.uid()));

CREATE POLICY "Mission members can write radar signals"
  ON public.mission_radar_signals FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_team_members m WHERE m.mission_id = mission_radar_signals.mission_id AND m.member_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_team_members m WHERE m.mission_id = mission_radar_signals.mission_id AND m.member_id = auth.uid()));

CREATE TABLE public.mission_radar_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  signals jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_mission_radar_snapshots_mission ON public.mission_radar_snapshots(mission_id, captured_at DESC);

GRANT SELECT, INSERT ON public.mission_radar_snapshots TO authenticated;
GRANT ALL ON public.mission_radar_snapshots TO service_role;
ALTER TABLE public.mission_radar_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read radar snapshots"
  ON public.mission_radar_snapshots FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_team_members m WHERE m.mission_id = mission_radar_snapshots.mission_id AND m.member_id = auth.uid()));

CREATE POLICY "Mission members can insert radar snapshots"
  ON public.mission_radar_snapshots FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_team_members m WHERE m.mission_id = mission_radar_snapshots.mission_id AND m.member_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.mission_radar_signals_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_mission_radar_signals_updated
BEFORE UPDATE ON public.mission_radar_signals
FOR EACH ROW EXECUTE FUNCTION public.mission_radar_signals_set_updated_at();