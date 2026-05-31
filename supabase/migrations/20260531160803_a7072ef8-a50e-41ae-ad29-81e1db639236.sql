ALTER TABLE public.sos_alerts
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'sos'
  CHECK (request_type IN ('sos', 'support'));

CREATE INDEX IF NOT EXISTS idx_sos_alerts_eng_type_status
  ON public.sos_alerts (engagement_id, request_type, status);