
ALTER TABLE public.mission_monitoring_sources
  ADD COLUMN IF NOT EXISTS last_content_hash text,
  ADD COLUMN IF NOT EXISTS last_signal_at timestamptz;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop any previous schedule before re-registering.
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'iris-monitor-hourly';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'iris-monitor-hourly',
  '7 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/iris-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxdG11bGdoaXhjaXJ2YW1kY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjcxNzYsImV4cCI6MjA5NTY0MzE3Nn0.EBK6LGcv_NFMTrMZdn84me1h9x0TzZe4lnIkIAs33RM'
    ),
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);
