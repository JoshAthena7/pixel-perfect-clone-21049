
-- 0.1 (2) daily_checkins uniqueness — already exists, skip

-- 0.1 (5) Simplify role check (remove 'reviewer')
DO $$ BEGIN
  ALTER TABLE public.engagement_members DROP CONSTRAINT engagement_members_role_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
ALTER TABLE public.engagement_members ADD CONSTRAINT engagement_members_role_check
  CHECK (role = ANY (ARRAY['founder','pm','engagement_lead','writer','viewer']));

-- 0.1 (6) handle_new_user trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 0.2 (1) Extend engagement_config
ALTER TABLE public.engagement_config
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS market text,
  ADD COLUMN IF NOT EXISTS engagement_type text,
  ADD COLUMN IF NOT EXISTS contract_value_estimate text,
  ADD COLUMN IF NOT EXISTS radar_monitoring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS radar_keywords text[],
  ADD COLUMN IF NOT EXISTS research_completed_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.engagement_config
    ADD CONSTRAINT engagement_config_type_check
    CHECK (engagement_type IS NULL OR engagement_type = ANY (ARRAY['RFP','Recompete','Sole Source','Task Order','RFAI','Sources Sought']));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.engagement_config
    ADD CONSTRAINT engagement_config_engagement_unique UNIQUE (engagement_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 0.2 (3) Add 'Placeholder' status
DO $$ BEGIN
  ALTER TABLE public.engagements DROP CONSTRAINT engagements_status_check;
EXCEPTION WHEN undefined_object THEN NULL; END $$;
ALTER TABLE public.engagements ADD CONSTRAINT engagements_status_check
  CHECK (status = ANY (ARRAY['Active','Closed','Archived','Placeholder']));

-- 0.2 (4) engagement_research table (idempotent)
CREATE TABLE IF NOT EXISTS public.engagement_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  category text NOT NULL,
  title text,
  content jsonb,
  source text,
  confidence_score numeric,
  needs_human_input boolean NOT NULL DEFAULT false,
  human_input_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_research TO authenticated;
GRANT ALL ON public.engagement_research TO service_role;

ALTER TABLE public.engagement_research ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view engagement research" ON public.engagement_research;
CREATE POLICY "Members can view engagement research"
  ON public.engagement_research FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

DROP POLICY IF EXISTS "Leadership can insert engagement research" ON public.engagement_research;
CREATE POLICY "Leadership can insert engagement research"
  ON public.engagement_research FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

DROP POLICY IF EXISTS "Leadership can update engagement research" ON public.engagement_research;
CREATE POLICY "Leadership can update engagement research"
  ON public.engagement_research FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

DROP POLICY IF EXISTS "Leadership can delete engagement research" ON public.engagement_research;
CREATE POLICY "Leadership can delete engagement research"
  ON public.engagement_research FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

DROP TRIGGER IF EXISTS update_engagement_research_updated_at ON public.engagement_research;
CREATE TRIGGER update_engagement_research_updated_at
  BEFORE UPDATE ON public.engagement_research
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 0.3 Indexes
CREATE INDEX IF NOT EXISTS idx_engagements_status ON public.engagements(status);
CREATE INDEX IF NOT EXISTS idx_engagements_created_by ON public.engagements(created_by);
CREATE INDEX IF NOT EXISTS idx_work_log_engagement ON public.work_log(engagement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_huddles_engagement ON public.huddles(engagement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_engagement ON public.decisions(engagement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_research_engagement ON public.engagement_research(engagement_id, category);

-- 0.3 cleanup_quick_chats daily cron at 2am
DO $$ BEGIN
  PERFORM cron.unschedule('cleanup-quick-chats-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'cleanup-quick-chats-daily',
  '0 2 * * *',
  $$SELECT public.cleanup_quick_chats();$$
);
