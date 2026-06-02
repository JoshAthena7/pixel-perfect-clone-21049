-- Athena Command V0.1: reality_updates table + question_records IRIS fields

CREATE TABLE IF NOT EXISTS public.reality_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.question_records(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  user_name TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('learned','need','unchanged')),
  need_type TEXT CHECK (need_type IN ('direction','decision','help','air_cover')),
  details TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reality_updates_question ON public.reality_updates(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reality_updates_mission ON public.reality_updates(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reality_updates_need_open ON public.reality_updates(mission_id, created_at DESC) WHERE signal_type = 'need' AND resolved = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reality_updates TO authenticated;
GRANT ALL ON public.reality_updates TO service_role;

ALTER TABLE public.reality_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ru_select_members" ON public.reality_updates
  FOR SELECT TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()));

CREATE POLICY "ru_insert_members" ON public.reality_updates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "ru_update_leads_or_author" ON public.reality_updates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (user_id = auth.uid() OR public.has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

-- New IRIS-managed fields on question_records
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS current_focus TEXT;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS next_step TEXT;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS waiting_on TEXT;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS guidance TEXT;