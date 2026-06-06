ALTER TABLE public.mission_risks ADD COLUMN IF NOT EXISTS created_by_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.win_themes ADD COLUMN IF NOT EXISTS created_by_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.mission_strategy ADD COLUMN IF NOT EXISTS created_by_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.mission_client_intel ADD COLUMN IF NOT EXISTS created_by_system boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_mission_risks_system ON public.mission_risks (mission_id) WHERE created_by_system;
CREATE INDEX IF NOT EXISTS idx_win_themes_system ON public.win_themes (mission_id) WHERE created_by_system;
CREATE INDEX IF NOT EXISTS idx_mission_strategy_system ON public.mission_strategy (mission_id) WHERE created_by_system;
CREATE INDEX IF NOT EXISTS idx_mission_client_intel_system ON public.mission_client_intel (mission_id) WHERE created_by_system;