
-- Phase 1: Writer Portal schema

-- 1) Section briefs on existing heatmap_sections
ALTER TABLE public.heatmap_sections
  ADD COLUMN IF NOT EXISTS instructions text;

-- 2) section_assignments: which writer owns which section
CREATE TABLE IF NOT EXISTS public.section_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  section_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'Not Started',
  due_date date,
  word_count_min integer,
  word_count_max integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_assignments TO authenticated;
GRANT ALL ON public.section_assignments TO service_role;
ALTER TABLE public.section_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY section_assignments_select_member ON public.section_assignments
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY section_assignments_insert_leadership ON public.section_assignments
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY section_assignments_update_leadership ON public.section_assignments
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- writers can update status on their own assignment
CREATE POLICY section_assignments_update_own ON public.section_assignments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY section_assignments_delete_leadership ON public.section_assignments
  FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER section_assignments_touch_updated
  BEFORE UPDATE ON public.section_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_engagement_pulses_updated_at();

-- 3) win_themes
CREATE TABLE IF NOT EXISTS public.win_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  section_names text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.win_themes TO authenticated;
GRANT ALL ON public.win_themes TO service_role;
ALTER TABLE public.win_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY win_themes_select_member ON public.win_themes FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY win_themes_write_leadership ON public.win_themes FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY win_themes_update_leadership ON public.win_themes FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY win_themes_delete_leadership ON public.win_themes FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- 4) faqs
CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faqs TO authenticated;
GRANT ALL ON public.faqs TO service_role;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY faqs_select_member ON public.faqs FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY faqs_write_leadership ON public.faqs FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY faqs_update_leadership ON public.faqs FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY faqs_delete_leadership ON public.faqs FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- 5) work_log (private per writer)
CREATE TABLE IF NOT EXISTS public.work_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  description text NOT NULL,
  section text,
  time_spent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_log TO authenticated;
GRANT ALL ON public.work_log TO service_role;
ALTER TABLE public.work_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_log_select_own ON public.work_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY work_log_insert_own ON public.work_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_engagement_member(engagement_id));
CREATE POLICY work_log_update_own ON public.work_log FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY work_log_delete_own ON public.work_log FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 6) writer_last_seen
CREATE TABLE IF NOT EXISTS public.writer_last_seen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  streak_count integer NOT NULL DEFAULT 1,
  streak_last_day date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (engagement_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.writer_last_seen TO authenticated;
GRANT ALL ON public.writer_last_seen TO service_role;
ALTER TABLE public.writer_last_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY wls_select_own ON public.writer_last_seen FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY wls_insert_own ON public.writer_last_seen FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND private.is_engagement_member(engagement_id));
CREATE POLICY wls_update_own ON public.writer_last_seen FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- 7) win_of_the_day
CREATE TABLE IF NOT EXISTS public.win_of_the_day (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  posted_by uuid,
  posted_by_name text NOT NULL,
  posted_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.win_of_the_day TO authenticated;
GRANT ALL ON public.win_of_the_day TO service_role;
ALTER TABLE public.win_of_the_day ENABLE ROW LEVEL SECURITY;

CREATE POLICY wotd_select_member ON public.win_of_the_day FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY wotd_insert_leadership ON public.win_of_the_day FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY wotd_delete_leadership ON public.win_of_the_day FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
