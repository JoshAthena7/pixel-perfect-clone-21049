CREATE TABLE IF NOT EXISTS public.mission_launch_briefs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  brief_text text NOT NULL,
  generated_by text DEFAULT 'iris',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mission_launch_briefs_mission_id_unique
  ON public.mission_launch_briefs(mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_launch_briefs TO authenticated;
GRANT ALL ON public.mission_launch_briefs TO service_role;

ALTER TABLE public.mission_launch_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view launch briefs"
  ON public.mission_launch_briefs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role manages launch briefs"
  ON public.mission_launch_briefs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
