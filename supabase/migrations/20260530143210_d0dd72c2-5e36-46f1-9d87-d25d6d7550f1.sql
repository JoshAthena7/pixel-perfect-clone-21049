
-- =========================
-- PRIORITY 1: BUG FIXES
-- =========================

-- 1) engagement_pulses: composite unique (engagement_id, member_id)
ALTER TABLE public.engagement_pulses
  DROP CONSTRAINT IF EXISTS engagement_pulses_member_id_key;

ALTER TABLE public.engagement_pulses
  ADD CONSTRAINT engagement_pulses_engagement_member_key
  UNIQUE (engagement_id, member_id);

-- 2) daily_checkins: add user_id + per-day uniqueness
ALTER TABLE public.daily_checkins
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user
  ON public.daily_checkins(engagement_id, user_id, checkin_date DESC);

-- Partial unique so legacy rows without user_id don't conflict
CREATE UNIQUE INDEX IF NOT EXISTS daily_checkins_user_date_unique
  ON public.daily_checkins(engagement_id, user_id, checkin_date)
  WHERE user_id IS NOT NULL;

-- Tighten insert policy: when user_id is provided it must be the caller
DROP POLICY IF EXISTS daily_checkins_insert_member ON public.daily_checkins;
CREATE POLICY daily_checkins_insert_member
  ON public.daily_checkins
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_engagement_member(engagement_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- 3) Wire handle_new_user() trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profile rows for existing auth users
INSERT INTO public.profiles (id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- =========================
-- PRIORITY 2: DATA INTEGRITY
-- =========================

-- 5) stuck_flags.section_id -> heatmap_sections(id) ON DELETE SET NULL
ALTER TABLE public.stuck_flags
  ALTER COLUMN section_id DROP NOT NULL;

ALTER TABLE public.stuck_flags
  DROP CONSTRAINT IF EXISTS stuck_flags_section_id_fkey;

ALTER TABLE public.stuck_flags
  ADD CONSTRAINT stuck_flags_section_id_fkey
  FOREIGN KEY (section_id) REFERENCES public.heatmap_sections(id) ON DELETE SET NULL;

-- 6) win_themes.section_names -> section_ids uuid[] (table currently empty)
ALTER TABLE public.win_themes DROP COLUMN IF EXISTS section_names;
ALTER TABLE public.win_themes
  ADD COLUMN section_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

-- 7) Leadership SELECT visibility on writer activity
CREATE POLICY work_log_select_leadership
  ON public.work_log
  FOR SELECT
  TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY writer_last_seen_select_leadership
  ON public.writer_last_seen
  FOR SELECT
  TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
