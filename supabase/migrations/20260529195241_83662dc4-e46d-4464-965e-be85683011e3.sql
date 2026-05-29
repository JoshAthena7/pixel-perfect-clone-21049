
ALTER TABLE public.engagement_members
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS slack_handle text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS on_call boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_engagement_members_on_call
  ON public.engagement_members (engagement_id, on_call);
