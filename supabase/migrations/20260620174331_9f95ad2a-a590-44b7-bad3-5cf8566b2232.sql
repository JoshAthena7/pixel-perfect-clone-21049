
CREATE OR REPLACE FUNCTION public.hybrid_oracle_search(
  p_mission_id uuid,
  p_query_text text,
  p_query_embedding vector(1536) DEFAULT NULL,
  p_limit int DEFAULT 15,
  p_include_tiers text[] DEFAULT ARRAY['platform','state','mission']
)
RETURNS TABLE(
  id uuid,
  title text,
  what_happened text,
  why_it_matters text,
  recommended_action text,
  category text,
  tier text,
  urgency text,
  relevance_score integer,
  source_name text,
  topic_tags text[],
  win_theme_tags text[],
  similarity_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_code text;
BEGIN
  SELECT m.state_code INTO v_state_code
    FROM public.missions m
   WHERE m.id = p_mission_id;

  RETURN QUERY
  SELECT
    os.id,
    os.title,
    os.what_happened,
    os.why_it_matters,
    os.recommended_action,
    os.category,
    os.tier,
    os.urgency,
    os.relevance_score,
    os.source_name,
    os.topic_tags,
    os.win_theme_tags,
    CASE
      WHEN p_query_embedding IS NOT NULL AND os.embedding IS NOT NULL THEN
        (0.60 * (1 - (os.embedding <=> p_query_embedding))) +
        (0.25 * COALESCE(
          ts_rank(
            to_tsvector('english', COALESCE(os.title,'') || ' ' || COALESCE(os.what_happened,'') || ' ' || COALESCE(os.why_it_matters,'')),
            plainto_tsquery('english', p_query_text)
          ), 0
        )) +
        (0.15 * (COALESCE(os.relevance_score,0)::float / 100))
      ELSE
        (0.70 * COALESCE(
          ts_rank(
            to_tsvector('english', COALESCE(os.title,'') || ' ' || COALESCE(os.what_happened,'') || ' ' || COALESCE(os.why_it_matters,'')),
            plainto_tsquery('english', p_query_text)
          ), 0
        )) +
        (0.30 * (COALESCE(os.relevance_score,0)::float / 100))
    END::float AS similarity_score
  FROM public.oracle_signals os
  WHERE
    os.status IN ('approved','pushed')
    AND os.tier = ANY(p_include_tiers)
    AND (
      (os.tier = 'mission' AND os.mission_id = p_mission_id)
      OR (os.tier = 'state' AND os.state_code = v_state_code)
      OR (os.tier = 'platform')
    )
  ORDER BY similarity_score DESC
  LIMIT p_limit;
END;
$$;
