ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS iris_kickoff_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS iris_kickoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS iris_kickoff_summary JSONB;

COMMENT ON COLUMN public.missions.iris_kickoff_status IS
  'IRIS auto-pipeline state: idle | running | complete | failed. Set by kickoffMissionIris when the mission is activated or its RFP is parsed.';