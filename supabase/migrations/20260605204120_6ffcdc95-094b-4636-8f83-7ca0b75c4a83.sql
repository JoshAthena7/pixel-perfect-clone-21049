-- 1. Vault extraction columns: lets us store parsed text + track status
ALTER TABLE public.mission_vault_documents
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','processing','ready','failed','skipped','no_file')),
  ADD COLUMN IF NOT EXISTS extraction_error TEXT;

CREATE INDEX IF NOT EXISTS idx_mvd_extraction_status
  ON public.mission_vault_documents (extraction_status)
  WHERE extraction_status IN ('pending','failed');

-- 2. Unified IRIS context retriever — single vector search across every
--    embedded source (vault, library, atlas, market intel, research, etc.).
--    SECURITY INVOKER so RLS on embeddings still scopes to the caller's
--    mission membership.
CREATE OR REPLACE FUNCTION public.match_iris_context(
  p_mission_id uuid,
  p_query vector(1536),
  p_k int DEFAULT 12
)
RETURNS TABLE (
  id uuid,
  source_table text,
  source_id uuid,
  mission_id uuid,
  scope text,
  content_text text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.source_table,
    e.source_id,
    e.mission_id,
    e.scope,
    e.content_text,
    (1 - (e.embedding <=> p_query))::double precision AS similarity
  FROM public.embeddings e
  WHERE e.embedding IS NOT NULL
    AND (
      e.scope = 'global'
      OR (e.scope = 'mission' AND p_mission_id IS NOT NULL AND e.mission_id = p_mission_id)
    )
  ORDER BY e.embedding <=> p_query
  LIMIT GREATEST(p_k, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_iris_context(uuid, vector, int)
  TO authenticated, service_role;