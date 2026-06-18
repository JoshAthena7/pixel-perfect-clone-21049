
-- 1. Add slack_user_id to profiles (nullable)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS slack_user_id text;

-- 2. Add webhook URLs to missions (nullable; TODO: move to secrets before production)
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS slack_webhook_url text;
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS teams_webhook_url text;

-- 3. mission_nudges table
CREATE TABLE IF NOT EXISTS public.mission_nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  message text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('slack','teams')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','pending')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.mission_nudges TO authenticated;
GRANT ALL ON public.mission_nudges TO service_role;

ALTER TABLE public.mission_nudges ENABLE ROW LEVEL SECURITY;

-- PMs/leads can insert and read nudges for their mission
CREATE POLICY "PMs can read mission_nudges"
ON public.mission_nudges FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_team_members m
    WHERE m.mission_id = mission_nudges.mission_id
      AND m.member_id = auth.uid()
      AND m.mission_role IN ('lead','engagement_lead','project_manager')
  )
  OR recipient_id = auth.uid()
);

CREATE POLICY "PMs can insert mission_nudges"
ON public.mission_nudges FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mission_team_members m
      WHERE m.mission_id = mission_nudges.mission_id
        AND m.member_id = auth.uid()
        AND m.mission_role IN ('lead','engagement_lead','project_manager')
    )
  )
);

CREATE INDEX IF NOT EXISTS mission_nudges_recipient_idx
  ON public.mission_nudges(recipient_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS mission_nudges_mission_idx
  ON public.mission_nudges(mission_id, sent_at DESC);

-- 4. Extend mission_assist_events event_type check to include nudge_sent
ALTER TABLE public.mission_assist_events
  DROP CONSTRAINT IF EXISTS mission_assist_events_event_type_check;

ALTER TABLE public.mission_assist_events
  ADD CONSTRAINT mission_assist_events_event_type_check
  CHECK (event_type IN (
    'brief_opened','brief_exported','assist_acknowledged','assist_ignored',
    'feedback_submitted','sos_raised','status_updated','check_in',
    'mock_scored','pulse_posted','sticky_note_posted','nudge_sent'
  ));
