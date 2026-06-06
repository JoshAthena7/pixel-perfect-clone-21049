
-- ============= mission_sections =============
CREATE TABLE public.mission_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  number text NOT NULL,
  title text NOT NULL,
  rfp_page_ref text,
  assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  internal_due_date date,
  studio_status text,
  studio_progress_pct int,
  studio_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_sections TO authenticated;
GRANT ALL ON public.mission_sections TO service_role;
ALTER TABLE public.mission_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read sections"
  ON public.mission_sections FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm
                 WHERE mm.mission_id = mission_sections.mission_id
                   AND mm.user_id = auth.uid()));

CREATE POLICY "Mission PMs can manage sections"
  ON public.mission_sections FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm
                 WHERE mm.mission_id = mission_sections.mission_id
                   AND mm.user_id = auth.uid()
                   AND lower(mm.role) IN ('pm','project manager','project_manager','lead')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_members mm
                 WHERE mm.mission_id = mission_sections.mission_id
                   AND mm.user_id = auth.uid()
                   AND lower(mm.role) IN ('pm','project manager','project_manager','lead')));

CREATE INDEX idx_mission_sections_mission ON public.mission_sections(mission_id);
CREATE INDEX idx_mission_sections_assignee ON public.mission_sections(assigned_user_id);

-- ============= checkin_cycles =============
CREATE TABLE public.checkin_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  cycle_start date NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('weekly','milestone_14','milestone_7','milestone_48h')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, cycle_start, trigger_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checkin_cycles TO authenticated;
GRANT ALL ON public.checkin_cycles TO service_role;
ALTER TABLE public.checkin_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read cycles"
  ON public.checkin_cycles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm
                 WHERE mm.mission_id = checkin_cycles.mission_id
                   AND mm.user_id = auth.uid()));

-- ============= checkin_tokens =============
-- No anon/authenticated select policy: only readable via service_role (server fn).
CREATE TABLE public.checkin_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.checkin_cycles(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  writer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, writer_user_id)
);
GRANT ALL ON public.checkin_tokens TO service_role;
ALTER TABLE public.checkin_tokens ENABLE ROW LEVEL SECURITY;
-- intentionally no policies; service role bypasses RLS.

CREATE INDEX idx_checkin_tokens_token ON public.checkin_tokens(token);

-- ============= checkin_submissions =============
CREATE TABLE public.checkin_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.checkin_cycles(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  writer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, writer_user_id)
);
GRANT SELECT ON public.checkin_submissions TO authenticated;
GRANT ALL ON public.checkin_submissions TO service_role;
ALTER TABLE public.checkin_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Writers see their submissions"
  ON public.checkin_submissions FOR SELECT TO authenticated
  USING (writer_user_id = auth.uid());

CREATE POLICY "Mission PMs see all submissions"
  ON public.checkin_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm
                 WHERE mm.mission_id = checkin_submissions.mission_id
                   AND mm.user_id = auth.uid()
                   AND lower(mm.role) IN ('pm','project manager','project_manager','lead')));

-- ============= checkin_section_updates =============
CREATE TABLE public.checkin_section_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.checkin_submissions(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.mission_sections(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('not_started','in_progress','draft_done','blocked')),
  progress_pct int CHECK (progress_pct BETWEEN 0 AND 100),
  notes text CHECK (char_length(coalesce(notes,'')) <= 140),
  source text NOT NULL DEFAULT 'checkin' CHECK (source IN ('checkin','studio')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, section_id)
);
GRANT SELECT ON public.checkin_section_updates TO authenticated;
GRANT ALL ON public.checkin_section_updates TO service_role;
ALTER TABLE public.checkin_section_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Readable when submission is readable"
  ON public.checkin_section_updates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checkin_submissions s
                 WHERE s.id = checkin_section_updates.submission_id
                   AND (s.writer_user_id = auth.uid()
                        OR EXISTS (SELECT 1 FROM public.mission_members mm
                                   WHERE mm.mission_id = s.mission_id
                                     AND mm.user_id = auth.uid()
                                     AND lower(mm.role) IN ('pm','project manager','project_manager','lead')))));

CREATE INDEX idx_csu_section ON public.checkin_section_updates(section_id);

-- updated_at trigger for mission_sections
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_mission_sections_updated_at
  BEFORE UPDATE ON public.mission_sections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
