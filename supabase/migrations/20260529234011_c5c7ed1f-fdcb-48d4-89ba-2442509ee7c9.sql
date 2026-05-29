
-- TRIVIA ANSWERS
CREATE TABLE public.trivia_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  question_day integer NOT NULL,
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, member_id, question_day)
);

GRANT SELECT, INSERT ON public.trivia_answers TO authenticated;
GRANT ALL ON public.trivia_answers TO service_role;

ALTER TABLE public.trivia_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY trivia_answers_select_member ON public.trivia_answers
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY trivia_answers_insert_self ON public.trivia_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_engagement_member(engagement_id)
    AND user_id = auth.uid()
    AND member_id IN (
      SELECT em.id FROM public.engagement_members em
      WHERE em.user_id = auth.uid() AND em.engagement_id = trivia_answers.engagement_id
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.trivia_answers;
ALTER TABLE public.trivia_answers REPLICA IDENTITY FULL;

-- TRIVIA WINNERS
CREATE TABLE public.trivia_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL UNIQUE,
  winner_member_id uuid NOT NULL,
  winner_name text NOT NULL,
  message text,
  prize text,
  declared_by uuid NOT NULL,
  declared_by_name text NOT NULL,
  declared_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trivia_winners TO authenticated;
GRANT ALL ON public.trivia_winners TO service_role;

ALTER TABLE public.trivia_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY trivia_winners_select_member ON public.trivia_winners
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY trivia_winners_insert_leadership ON public.trivia_winners
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
    AND declared_by = auth.uid()
  );

CREATE POLICY trivia_winners_update_leadership ON public.trivia_winners
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY trivia_winners_delete_leadership ON public.trivia_winners
  FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

ALTER PUBLICATION supabase_realtime ADD TABLE public.trivia_winners;
