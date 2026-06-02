CREATE TABLE public.note_reads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id UUID NOT NULL,
  user_id UUID NOT NULL,
  mission_id UUID NOT NULL,
  seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (note_id, user_id)
);

CREATE INDEX idx_note_reads_note ON public.note_reads(note_id);
CREATE INDEX idx_note_reads_mission ON public.note_reads(mission_id);

GRANT SELECT, INSERT ON public.note_reads TO authenticated;
GRANT ALL ON public.note_reads TO service_role;

ALTER TABLE public.note_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nr_select_members"
  ON public.note_reads
  FOR SELECT
  TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY "nr_insert_self"
  ON public.note_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND is_mission_member(mission_id, auth.uid()));