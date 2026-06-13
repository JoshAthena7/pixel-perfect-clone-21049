CREATE TABLE IF NOT EXISTS public.question_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid REFERENCES public.questions(id) ON DELETE CASCADE,
  thread_id uuid,

  what_they_really_asking text,
  why_it_matters text,
  evaluator_perspective text,
  member_perspective text,
  provider_perspective text,
  key_messages_to_reinforce text[],
  things_to_avoid text[],
  proof_points text[],
  suggested_smes text[],

  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by_iris boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_briefs TO authenticated;
GRANT ALL ON public.question_briefs TO service_role;

ALTER TABLE public.question_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qb_select_members" ON public.question_briefs
  FOR SELECT USING (
    public.is_mission_member(mission_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "qb_insert_members" ON public.question_briefs
  FOR INSERT WITH CHECK (
    public.is_mission_member(mission_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "qb_update_members" ON public.question_briefs
  FOR UPDATE USING (
    public.is_mission_member(mission_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) WITH CHECK (
    public.is_mission_member(mission_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "qb_delete_admin" ON public.question_briefs
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_question_briefs_mission ON public.question_briefs(mission_id);
CREATE INDEX IF NOT EXISTS idx_question_briefs_question ON public.question_briefs(question_id);
CREATE INDEX IF NOT EXISTS idx_question_briefs_thread ON public.question_briefs(thread_id);

CREATE TRIGGER update_question_briefs_updated_at
  BEFORE UPDATE ON public.question_briefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();