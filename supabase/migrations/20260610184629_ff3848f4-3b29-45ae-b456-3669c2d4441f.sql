SELECT cron.schedule(
  'generate-daily-briefs',
  '30 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--7bfa8d36-2720-42a4-8ca9-23881aaf003a.lovable.app/api/public/hooks/generate-daily-briefs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxdG11bGdoaXhjaXJ2YW1kY29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjcxNzYsImV4cCI6MjA5NTY0MzE3Nn0.EBK6LGcv_NFMTrMZdn84me1h9x0TzZe4lnIkIAs33RM'),
    body := '{}'::jsonb
  );
  $$
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.missions;