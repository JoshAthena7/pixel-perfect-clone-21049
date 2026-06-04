
-- ============================================================
-- Prompt 05: M2, M6, L2, L3 schema / policy changes
-- ============================================================

-- ---------- L3: app_config table to replace hard-coded URLs ----------
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_config TO authenticated;
GRANT ALL ON public.app_config TO service_role;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage app_config" ON public.app_config;
CREATE POLICY "Admins manage app_config" ON public.app_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated read app_config" ON public.app_config;
CREATE POLICY "Authenticated read app_config" ON public.app_config
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.app_config (key, value)
  VALUES ('app_base_url', 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app')
  ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_app_base_url()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT value FROM public.app_config WHERE key = 'app_base_url' LIMIT 1
$$;

-- Replace call_hook to use config
CREATE OR REPLACE FUNCTION public.call_hook(path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  base TEXT := public.get_app_base_url();
BEGIN
  IF base IS NULL OR base = '' THEN
    RAISE EXCEPTION 'app_base_url not configured in app_config';
  END IF;
  PERFORM net.http_post(
    url := base || path,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
END;
$$;

-- Replace trigger_outcome_processing to use config
CREATE OR REPLACE FUNCTION public.trigger_outcome_processing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  base TEXT := public.get_app_base_url();
BEGIN
  IF base IS NULL OR base = '' THEN
    RAISE EXCEPTION 'app_base_url not configured in app_config';
  END IF;
  PERFORM net.http_post(
    url := base || '/api/public/hooks/process-outcome',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('engagement_id', NEW.engagement_id, 'outcome', NEW.outcome)
  );
  RETURN NEW;
END;
$$;

-- ---------- M2: score_me_history retention ----------
-- full_analysis contains IRIS-generated commentary (score_context, reasons,
-- changes, compliance_findings notes, confidence_note). Even though it's not
-- raw draft text, it can echo phrasing from the draft. Apply same 90-day
-- retention window that response_text would have had (C1).
CREATE OR REPLACE FUNCTION public.prune_score_me_full_analysis()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.score_me_history
     SET full_analysis = NULL
   WHERE created_at < (now() - interval '90 days')
     AND full_analysis IS NOT NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- One-time backfill: prune existing rows older than 90 days right now.
SELECT public.prune_score_me_full_analysis();

-- ---------- M6: mock_scores tighten write policies ----------
DROP POLICY IF EXISTS "Mission leads manage mock scores" ON public.mock_scores;

-- INSERT: lead/owner/admin on the mission OR platform admin
CREATE POLICY "mock_scores_insert_lead" ON public.mock_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
       WHERE mm.mission_id = mock_scores.mission_id
         AND mm.user_id = auth.uid()
         AND mm.role IN ('lead','owner','admin')
    )
  );

CREATE POLICY "mock_scores_update_lead" ON public.mock_scores
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
       WHERE mm.mission_id = mock_scores.mission_id
         AND mm.user_id = auth.uid()
         AND mm.role IN ('lead','owner','admin')
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
       WHERE mm.mission_id = mock_scores.mission_id
         AND mm.user_id = auth.uid()
         AND mm.role IN ('lead','owner','admin')
    )
  );

CREATE POLICY "mock_scores_delete_lead" ON public.mock_scores
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mission_members mm
       WHERE mm.mission_id = mock_scores.mission_id
         AND mm.user_id = auth.uid()
         AND mm.role IN ('lead','owner','admin')
    )
  );

-- ---------- L2: schedule retention jobs via pg_cron (safe in-DB) ----------
-- Use DO blocks so re-runs don't error.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-score-me-full-analysis') THEN
    PERFORM cron.schedule(
      'prune-score-me-full-analysis',
      '15 3 * * *',
      $cron$ SELECT public.prune_score_me_full_analysis(); $cron$
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-pulse-free-text') THEN
    PERFORM cron.schedule(
      'prune-pulse-free-text',
      '30 3 * * *',
      $cron$ SELECT public.prune_pulse_free_text(); $cron$
    );
  END IF;
END $$;
