
-- PR A: IRIS-2 foundation — schema additions for evaluator simulation, win-theme coverage,
-- competitor angles, briefing content storage, and cross-session conversation context.

-- 1) mission_iris_config: evaluator + win theme + competitor metadata
ALTER TABLE public.mission_iris_config
  ADD COLUMN IF NOT EXISTS evaluator_name text,
  ADD COLUMN IF NOT EXISTS win_theme_keywords text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS known_competitors jsonb DEFAULT '[]'::jsonb;

-- 2) question_progress: persisted brief content (Briefing Room cache + Score Me history feed)
ALTER TABLE public.question_progress
  ADD COLUMN IF NOT EXISTS brief_content jsonb;

-- 3) iris_conversation_context — cross-session memory per (user, mission)
CREATE TABLE IF NOT EXISTS public.iris_conversation_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  summary text,                     -- rolling summary of the conversation
  recent_topics jsonb DEFAULT '[]'::jsonb, -- list of {topic, last_seen}
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mission_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iris_conversation_context TO authenticated;
GRANT ALL ON public.iris_conversation_context TO service_role;

ALTER TABLE public.iris_conversation_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_iris_context_select" ON public.iris_conversation_context
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own_iris_context_insert" ON public.iris_conversation_context
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_iris_context_update" ON public.iris_conversation_context
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_iris_context_delete" ON public.iris_conversation_context
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_iris_conv_context_user_mission
  ON public.iris_conversation_context (user_id, mission_id);

-- Reuse the existing public.update_updated_at_column() trigger fn (already defined in earlier migrations).
DROP TRIGGER IF EXISTS trg_iris_conv_context_updated_at ON public.iris_conversation_context;
CREATE TRIGGER trg_iris_conv_context_updated_at
  BEFORE UPDATE ON public.iris_conversation_context
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
