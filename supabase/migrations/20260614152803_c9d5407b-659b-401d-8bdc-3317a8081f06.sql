
CREATE TABLE IF NOT EXISTS public.oracle_knowledge_base (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  thread_id uuid,
  core_insight text NOT NULL,
  topic_tags text[],
  applicable_mission_types text[],
  confidence text CHECK (confidence IN ('high','medium','low')),
  source_summary text,
  extracted_by text DEFAULT 'iris',
  created_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.oracle_knowledge_base TO authenticated;
GRANT ALL ON public.oracle_knowledge_base TO service_role;

ALTER TABLE public.oracle_knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read oracle knowledge base"
  ON public.oracle_knowledge_base FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS oracle_knowledge_base_mission_idx
  ON public.oracle_knowledge_base(mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS oracle_knowledge_base_thread_idx
  ON public.oracle_knowledge_base(thread_id);
