
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS why_it_matters text,
  ADD COLUMN IF NOT EXISTS prime_contractor text,
  ADD COLUMN IF NOT EXISTS writing_signals jsonb DEFAULT '{"care_about":[],"avoid":[],"repeat_often":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS health_score integer,
  ADD COLUMN IF NOT EXISTS team_readiness_score integer,
  ADD COLUMN IF NOT EXISTS intel_coverage_score integer;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='missions_health_score_chk') THEN
    ALTER TABLE public.missions ADD CONSTRAINT missions_health_score_chk CHECK (health_score IS NULL OR health_score BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='missions_team_readiness_score_chk') THEN
    ALTER TABLE public.missions ADD CONSTRAINT missions_team_readiness_score_chk CHECK (team_readiness_score IS NULL OR team_readiness_score BETWEEN 0 AND 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='missions_intel_coverage_score_chk') THEN
    ALTER TABLE public.missions ADD CONSTRAINT missions_intel_coverage_score_chk CHECK (intel_coverage_score IS NULL OR intel_coverage_score BETWEEN 0 AND 100);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.mission_north_star (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  content text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('draft','approved','superseded')) DEFAULT 'draft',
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  iris_suggested boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_north_star_mission ON public.mission_north_star(mission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_north_star TO authenticated;
GRANT ALL ON public.mission_north_star TO service_role;
ALTER TABLE public.mission_north_star ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mns_select ON public.mission_north_star;
DROP POLICY IF EXISTS mns_write ON public.mission_north_star;
CREATE POLICY mns_select ON public.mission_north_star FOR SELECT TO authenticated USING (is_mission_member(mission_id, auth.uid()));
CREATE POLICY mns_write ON public.mission_north_star FOR ALL TO authenticated USING (is_mission_member(mission_id, auth.uid())) WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.mission_daily_focus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  focus_date date NOT NULL DEFAULT CURRENT_DATE,
  focus_text text NOT NULL,
  priority_areas text[] DEFAULT '{}',
  reason text,
  generated_by text CHECK (generated_by IN ('iris','human')) DEFAULT 'iris',
  status text CHECK (status IN ('pending_approval','approved','rejected')) DEFAULT 'pending_approval',
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  iris_confidence text CHECK (iris_confidence IN ('high','medium','low')) DEFAULT 'medium',
  created_at timestamptz DEFAULT now(),
  UNIQUE(mission_id, focus_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_focus_mission_date ON public.mission_daily_focus(mission_id, focus_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_daily_focus TO authenticated;
GRANT ALL ON public.mission_daily_focus TO service_role;
ALTER TABLE public.mission_daily_focus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mdf_select ON public.mission_daily_focus;
DROP POLICY IF EXISTS mdf_write ON public.mission_daily_focus;
CREATE POLICY mdf_select ON public.mission_daily_focus FOR SELECT TO authenticated USING (is_mission_member(mission_id, auth.uid()));
CREATE POLICY mdf_write ON public.mission_daily_focus FOR ALL TO authenticated USING (is_mission_member(mission_id, auth.uid())) WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.mission_win_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  title text NOT NULL,
  icon text,
  why_it_matters text,
  what_theyre_buying text,
  proof_points text[] DEFAULT '{}',
  watch_outs text[] DEFAULT '{}',
  alignment_score integer CHECK (alignment_score IS NULL OR alignment_score BETWEEN 0 AND 100),
  related_intel_ids uuid[] DEFAULT '{}',
  display_order integer DEFAULT 0,
  status text CHECK (status IN ('active','archived')) DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_win_themes_mission ON public.mission_win_themes(mission_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_win_themes TO authenticated;
GRANT ALL ON public.mission_win_themes TO service_role;
ALTER TABLE public.mission_win_themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mwt_select ON public.mission_win_themes;
DROP POLICY IF EXISTS mwt_write ON public.mission_win_themes;
CREATE POLICY mwt_select ON public.mission_win_themes FOR SELECT TO authenticated USING (is_mission_member(mission_id, auth.uid()));
CREATE POLICY mwt_write ON public.mission_win_themes FOR ALL TO authenticated USING (is_mission_member(mission_id, auth.uid())) WITH CHECK (is_mission_member(mission_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.mission_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  milestone_type text NOT NULL CHECK (milestone_type IN ('kickoff','pink_team','red_team','gold_team','submission','award','custom')),
  title text,
  milestone_date date NOT NULL,
  owner_id uuid REFERENCES auth.users(id),
  status text CHECK (status IN ('upcoming','in_progress','complete','at_risk','missed')) DEFAULT 'upcoming',
  notes text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_milestones_mission ON public.mission_milestones(mission_id, milestone_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_milestones TO authenticated;
GRANT ALL ON public.mission_milestones TO service_role;
ALTER TABLE public.mission_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mm_select ON public.mission_milestones;
DROP POLICY IF EXISTS mm_write ON public.mission_milestones;
CREATE POLICY mm_select ON public.mission_milestones FOR SELECT TO authenticated USING (is_mission_member(mission_id, auth.uid()));
CREATE POLICY mm_write ON public.mission_milestones FOR ALL TO authenticated USING (is_mission_member(mission_id, auth.uid())) WITH CHECK (is_mission_member(mission_id, auth.uid()));

INSERT INTO public.mission_milestones (mission_id, milestone_type, title, milestone_date, status)
SELECT m.id, 'submission', 'Submission Deadline', m.submission_deadline::date, 'upcoming'
FROM public.missions m
WHERE m.submission_deadline IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.mission_milestones mm WHERE mm.mission_id = m.id AND mm.milestone_type = 'submission');

INSERT INTO public.mission_win_themes (mission_id, title, why_it_matters, status)
SELECT wt.mission_id, wt.title, wt.key_message, COALESCE(wt.status, 'active')
FROM public.win_themes wt
JOIN public.missions m ON m.id = wt.mission_id
WHERE NOT EXISTS (SELECT 1 FROM public.mission_win_themes mwt WHERE mwt.mission_id = wt.mission_id AND mwt.title = wt.title);
