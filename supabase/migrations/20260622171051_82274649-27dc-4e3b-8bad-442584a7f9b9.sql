CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'iris-morning-briefs') THEN
    PERFORM cron.unschedule('iris-morning-briefs');
  END IF;
END$$;

SELECT cron.schedule(
  'iris-morning-briefs',
  '0 11 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/iris-morning-briefs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_hook_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cmd$
);