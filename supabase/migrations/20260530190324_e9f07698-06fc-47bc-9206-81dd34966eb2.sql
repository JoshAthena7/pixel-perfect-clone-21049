
CREATE TABLE IF NOT EXISTS public.web_research_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  category text NOT NULL,
  query text NOT NULL,
  result jsonb NOT NULL,
  source_urls text[] DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

GRANT SELECT ON public.web_research_cache TO authenticated;
GRANT ALL ON public.web_research_cache TO service_role;

ALTER TABLE public.web_research_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leadership can read cache"
ON public.web_research_cache FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM engagement_members
    WHERE user_id = auth.uid()
      AND role = ANY(ARRAY['founder','pm','engagement_lead'])
  )
);

CREATE POLICY "service writes cache"
ON public.web_research_cache FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS web_research_cache_key_idx ON public.web_research_cache (cache_key);
CREATE INDEX IF NOT EXISTS web_research_cache_expires_idx ON public.web_research_cache (expires_at);

-- Track Holy Grail run status per engagement (for background progress UI)
CREATE TABLE IF NOT EXISTS public.holy_grail_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  triggered_by uuid,
  triggered_by_name text,
  status text NOT NULL DEFAULT 'running', -- running | done | failed
  current_step text,
  steps_done int NOT NULL DEFAULT 0,
  steps_total int NOT NULL DEFAULT 8,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.holy_grail_runs TO authenticated;
GRANT ALL ON public.holy_grail_runs TO service_role;

ALTER TABLE public.holy_grail_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read runs"
ON public.holy_grail_runs FOR SELECT
TO authenticated
USING (private.is_engagement_member(engagement_id));

CREATE POLICY "service writes runs"
ON public.holy_grail_runs FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS holy_grail_runs_engagement_idx ON public.holy_grail_runs (engagement_id, created_at DESC);
