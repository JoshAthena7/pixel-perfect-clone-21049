
ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS writer_confidence TEXT
    CHECK (writer_confidence IN ('confident','uncertain','stuck')),
  ADD COLUMN IF NOT EXISTS confidence_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.pilot_copilot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.question_records(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_name TEXT NOT NULL,
  to_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL CHECK (message_type IN ('decision','guidance','alert','encouragement','coach_note','broadcast')),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 600),
  is_broadcast BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pcm_mission ON public.pilot_copilot_messages(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcm_question ON public.pilot_copilot_messages(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pcm_to_user ON public.pilot_copilot_messages(to_user_id, acknowledged, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.pilot_copilot_messages TO authenticated;
GRANT ALL ON public.pilot_copilot_messages TO service_role;

ALTER TABLE public.pilot_copilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcm_select_members" ON public.pilot_copilot_messages
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "pcm_insert_leads" ON public.pilot_copilot_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead'])
  );

CREATE POLICY "pcm_update_ack" ON public.pilot_copilot_messages
  FOR UPDATE TO authenticated
  USING (
    to_user_id = auth.uid()
    OR (is_broadcast AND public.is_mission_member(mission_id, auth.uid()))
    OR from_user_id = auth.uid()
  )
  WITH CHECK (
    to_user_id = auth.uid()
    OR (is_broadcast AND public.is_mission_member(mission_id, auth.uid()))
    OR from_user_id = auth.uid()
  );
