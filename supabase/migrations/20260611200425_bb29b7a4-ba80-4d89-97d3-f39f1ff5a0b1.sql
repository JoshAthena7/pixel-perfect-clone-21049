-- Repoint the iris-daily-intelligence-refresh cron job to the route that exists.
-- The previous URL /api/public/hooks/refresh-intelligence has no route file (404 daily).
-- The working route is /api/public/hooks/refresh-intelligence-graph.
SELECT cron.unschedule('iris-daily-intelligence-refresh');

SELECT cron.schedule(
  'iris-daily-intelligence-refresh',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/refresh-intelligence-graph',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxdG11bGdoaXhjaXJ2YW1kY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjcxNzYsImV4cCI6MjA5NTY0MzE3Nn0.EBK6LGcv_NFMTrMZdn84me1h9x0TzZe4lnIkIAs33RM"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);