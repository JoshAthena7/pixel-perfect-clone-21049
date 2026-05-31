CREATE TABLE public.alignment_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('Aligned', 'Drift', 'Misaligned', 'Blocked')),
  topic TEXT NOT NULL,
  notes TEXT,
  source TEXT,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Acknowledged', 'Resolved', 'Archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alignment_signals_eng_status ON public.alignment_signals (engagement_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alignment_signals TO authenticated;
GRANT ALL ON public.alignment_signals TO service_role;

ALTER TABLE public.alignment_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alignment_signals_select_member"
  ON public.alignment_signals FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "alignment_signals_insert_member"
  ON public.alignment_signals FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id) AND created_by = auth.uid());

CREATE POLICY "alignment_signals_update_leadership"
  ON public.alignment_signals FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "alignment_signals_delete_leadership"
  ON public.alignment_signals FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER alignment_signals_updated_at
  BEFORE UPDATE ON public.alignment_signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();