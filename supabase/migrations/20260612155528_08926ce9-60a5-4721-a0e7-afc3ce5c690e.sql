
CREATE TABLE public.team_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL,
  question_id UUID,
  sender_id UUID,
  sender_name TEXT NOT NULL,
  update_type TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX team_updates_mission_created_idx ON public.team_updates (mission_id, created_at DESC);
CREATE INDEX team_updates_type_idx ON public.team_updates (update_type);

GRANT SELECT, INSERT ON public.team_updates TO authenticated;
GRANT ALL ON public.team_updates TO service_role;

ALTER TABLE public.team_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view team updates"
  ON public.team_updates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_team_members mtm
      WHERE mtm.mission_id = team_updates.mission_id
        AND mtm.member_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = team_updates.mission_id
        AND m.created_by = auth.uid()
    )
  );

CREATE POLICY "Mission members can insert team updates"
  ON public.team_updates FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.mission_team_members mtm
        WHERE mtm.mission_id = team_updates.mission_id
          AND mtm.member_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.missions m
        WHERE m.id = team_updates.mission_id
          AND m.created_by = auth.uid()
      )
    )
  );

CREATE TABLE public.signal_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL,
  signal_type TEXT NOT NULL,
  signal_topic TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signal_patterns_mission_idx ON public.signal_patterns (mission_id, created_at DESC);

GRANT SELECT ON public.signal_patterns TO authenticated;
GRANT ALL ON public.signal_patterns TO service_role;

ALTER TABLE public.signal_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view signal patterns"
  ON public.signal_patterns FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_team_members mtm
      WHERE mtm.mission_id = signal_patterns.mission_id
        AND mtm.member_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.missions m
      WHERE m.id = signal_patterns.mission_id
        AND m.created_by = auth.uid()
    )
  );
