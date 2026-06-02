-- 1. Extend market_intelligence with the columns needed for the two-feed model
ALTER TABLE public.market_intelligence
  ADD COLUMN IF NOT EXISTS feed_type text NOT NULL DEFAULT 'industry',
  ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS question_ids uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS fetched_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_cross_referenced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_mission_ids uuid[] DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS market_intelligence_feed_type_idx
  ON public.market_intelligence (feed_type, created_at DESC);
CREATE INDEX IF NOT EXISTS market_intelligence_mission_id_idx
  ON public.market_intelligence (mission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS market_intelligence_matched_missions_idx
  ON public.market_intelligence USING GIN (matched_mission_ids);

-- 2. Make sure service_role can write (used by ingestion server fn / cron)
GRANT SELECT, INSERT, UPDATE ON public.market_intelligence TO authenticated;
GRANT ALL ON public.market_intelligence TO service_role;

-- 3. Similarity helper: for a given intel embedding, find the top missions
--    (and a few matched questions) whose question embeddings are most similar.
CREATE OR REPLACE FUNCTION public.match_intel_to_questions(
  query_embedding vector(1536),
  similarity_threshold float DEFAULT 0.75,
  max_questions int DEFAULT 20
)
RETURNS TABLE (
  mission_id uuid,
  question_id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.mission_id,
         e.source_id AS question_id,
         1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.embeddings e
  WHERE e.source_table = 'question_records'
    AND e.embedding IS NOT NULL
    AND e.mission_id IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT max_questions;
$$;

GRANT EXECUTE ON FUNCTION public.match_intel_to_questions(vector, float, int) TO authenticated, service_role;