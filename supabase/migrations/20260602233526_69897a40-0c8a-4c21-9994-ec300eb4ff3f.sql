-- ─── MISSION INTELLIGENCE DNA ────────────────────────────────────────────
CREATE TABLE public.mission_intelligence_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  dna jsonb NOT NULL,
  dna_version integer NOT NULL DEFAULT 1,
  generated_from text,
  generated_by uuid,
  generated_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_mid_mission ON public.mission_intelligence_dna(mission_id, dna_version DESC);
CREATE UNIQUE INDEX idx_mid_current ON public.mission_intelligence_dna(mission_id) WHERE is_current = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_intelligence_dna TO authenticated;
GRANT ALL ON public.mission_intelligence_dna TO service_role;

ALTER TABLE public.mission_intelligence_dna ENABLE ROW LEVEL SECURITY;

CREATE POLICY mid_select ON public.mission_intelligence_dna
  FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY mid_write_leads ON public.mission_intelligence_dna
  FOR ALL TO authenticated
  USING (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

-- ─── RESEARCH TASKS ──────────────────────────────────────────────────────
CREATE TABLE public.research_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  dna_id uuid REFERENCES public.mission_intelligence_dna(id) ON DELETE SET NULL,
  question text NOT NULL,
  why_it_matters text,
  relevant_rfp_sections text[] DEFAULT '{}'::text[],
  relevant_question_ids uuid[] DEFAULT '{}'::uuid[],
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'medium',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rt_mission_status ON public.research_tasks(mission_id, status, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_tasks TO authenticated;
GRANT ALL ON public.research_tasks TO service_role;

ALTER TABLE public.research_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rt_select ON public.research_tasks
  FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY rt_write_leads ON public.research_tasks
  FOR ALL TO authenticated
  USING (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

-- ─── RESEARCH RESULTS ────────────────────────────────────────────────────
CREATE TABLE public.research_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.research_tasks(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence text NOT NULL DEFAULT 'medium',
  follow_up_questions text[] DEFAULT '{}'::text[],
  embedding vector(1536),
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rr_task ON public.research_results(task_id);
CREATE INDEX idx_rr_mission ON public.research_results(mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_results TO authenticated;
GRANT ALL ON public.research_results TO service_role;

ALTER TABLE public.research_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY rr_select ON public.research_results
  FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY rr_write_leads ON public.research_results
  FOR ALL TO authenticated
  USING (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));

-- ─── QUESTION ↔ INTELLIGENCE MATCHES ─────────────────────────────────────
CREATE TABLE public.question_intelligence_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.research_tasks(id) ON DELETE CASCADE,
  result_id uuid NOT NULL REFERENCES public.research_results(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL,
  relevance_score numeric NOT NULL DEFAULT 0,
  matched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, result_id)
);
CREATE INDEX idx_qim_question ON public.question_intelligence_matches(question_id, relevance_score DESC);
CREATE INDEX idx_qim_mission ON public.question_intelligence_matches(mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_intelligence_matches TO authenticated;
GRANT ALL ON public.question_intelligence_matches TO service_role;

ALTER TABLE public.question_intelligence_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY qim_select ON public.question_intelligence_matches
  FOR SELECT TO authenticated
  USING (is_mission_member(mission_id, auth.uid()));

CREATE POLICY qim_write_leads ON public.question_intelligence_matches
  FOR ALL TO authenticated
  USING (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']))
  WITH CHECK (has_mission_role(mission_id, auth.uid(), ARRAY['admin','lead']));
