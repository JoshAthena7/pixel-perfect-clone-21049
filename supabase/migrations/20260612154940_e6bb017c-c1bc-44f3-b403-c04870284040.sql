CREATE TABLE IF NOT EXISTS public.expertise_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  user_id UUID,
  query_text TEXT NOT NULL,
  matched_user_ids UUID[] NOT NULL DEFAULT '{}',
  iris_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.expertise_queries TO authenticated;
GRANT ALL ON public.expertise_queries TO service_role;

ALTER TABLE public.expertise_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expertise_queries_select_mission_member" ON public.expertise_queries
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (mission_id IS NOT NULL AND public.is_mission_member(mission_id, auth.uid()))
  );

CREATE POLICY "expertise_queries_insert_mission_member" ON public.expertise_queries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (mission_id IS NOT NULL AND public.is_mission_member(mission_id, auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_expertise_queries_mission ON public.expertise_queries(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expertise_queries_question ON public.expertise_queries(question_id, created_at DESC);