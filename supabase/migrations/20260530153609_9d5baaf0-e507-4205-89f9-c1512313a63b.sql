CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Helper to POST to a hook url
CREATE OR REPLACE FUNCTION public.call_hook(path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app' || path,
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
END;
$$;

-- Unschedule any prior versions (idempotent)
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job WHERE jobname IN (
    'athena-process-embeddings',
    'athena-intelligence-engine',
    'athena-ingest-market-intel',
    'athena-weekly-brief'
  )
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- Every 5 minutes: drain the embedding queue
SELECT cron.schedule(
  'athena-process-embeddings',
  '*/5 * * * *',
  $$SELECT public.call_hook('/api/public/hooks/process-embeddings')$$
);

-- Hourly: pattern recognition
SELECT cron.schedule(
  'athena-intelligence-engine',
  '0 * * * *',
  $$SELECT public.call_hook('/api/public/hooks/intelligence-engine')$$
);

-- Hourly at :15 — market intel ingestion
SELECT cron.schedule(
  'athena-ingest-market-intel',
  '15 * * * *',
  $$SELECT public.call_hook('/api/public/hooks/ingest-market-intel')$$
);

-- Weekly Monday 7am UTC — executive weekly brief
SELECT cron.schedule(
  'athena-weekly-brief',
  '0 7 * * 1',
  $$SELECT public.call_hook('/api/public/hooks/weekly-brief')$$
);