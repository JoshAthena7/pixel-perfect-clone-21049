-- 1. Extend the ingestion queue status enum with 'promoted'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'promoted'
      AND enumtypid = 'public.oracle_ingestion_status'::regtype
  ) THEN
    ALTER TYPE public.oracle_ingestion_status ADD VALUE 'promoted';
  END IF;
END$$;

-- 2. Required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 3. Drop any previous versions of these schedules
DO $$
DECLARE
  v_jobname text;
BEGIN
  FOREACH v_jobname IN ARRAY ARRAY['oracle-scraper','oracle-classifier','oracle-promoter'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = v_jobname) THEN
      PERFORM cron.unschedule(v_jobname);
    END IF;
  END LOOP;
END$$;

-- 4. Schedule the three pipeline stages. The CRON_HOOK_SECRET project secret
-- must match `app.cron_hook_secret`; set it via:
--   ALTER ROLE postgres SET app.cron_hook_secret = '<secret>';
SELECT cron.schedule(
  'oracle-scraper',
  '0 */4 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/oracle-scraper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_hook_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'oracle-classifier',
  '*/30 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/oracle-classifier',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_hook_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);

SELECT cron.schedule(
  'oracle-promoter',
  '15,45 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/oracle-promoter',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_hook_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);