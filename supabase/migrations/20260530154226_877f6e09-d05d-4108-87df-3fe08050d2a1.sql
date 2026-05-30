
CREATE TABLE IF NOT EXISTS public.hook_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hook_name text NOT NULL,
  source text NOT NULL CHECK (source IN ('cron','handler','http')),
  jobid bigint,
  runid bigint,
  status_code int,
  error_message text,
  payload jsonb,
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid
);

CREATE INDEX IF NOT EXISTS idx_hook_failures_created ON public.hook_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hook_failures_unack ON public.hook_failures (acknowledged_at) WHERE acknowledged_at IS NULL;

GRANT SELECT, UPDATE ON public.hook_failures TO authenticated;
GRANT ALL ON public.hook_failures TO service_role;

ALTER TABLE public.hook_failures ENABLE ROW LEVEL SECURITY;

-- Leadership in any engagement can view
CREATE POLICY "Leadership can view hook failures"
ON public.hook_failures FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.engagement_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('founder','pm')
  )
);

-- Leadership can acknowledge
CREATE POLICY "Leadership can ack hook failures"
ON public.hook_failures FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.engagement_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('founder','pm')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.engagement_members m
    WHERE m.user_id = auth.uid()
      AND m.role IN ('founder','pm')
  )
);

-- Service role inserts via these functions
CREATE OR REPLACE FUNCTION public.record_hook_failure(
  _hook_name text,
  _source text,
  _status int,
  _error text,
  _payload jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_key text;
BEGIN
  v_key := _source || ':' || _hook_name || ':' || COALESCE(_status::text, 'x') || ':' ||
           md5(COALESCE(_error,'')) || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
  INSERT INTO public.hook_failures (hook_name, source, status_code, error_message, payload, dedupe_key)
  VALUES (_hook_name, _source, _status, left(COALESCE(_error,''), 2000), _payload, v_key)
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_hook_failure(text,text,int,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.record_hook_failure(text,text,int,text,jsonb) TO service_role;

-- Scan pg_cron + net._http_response for new failures
CREATE OR REPLACE FUNCTION public.scan_cron_failures(_since interval DEFAULT interval '15 minutes')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, net
AS $$
DECLARE
  v_count int := 0;
  v_id uuid;
  r record;
BEGIN
  -- Failed cron job runs
  FOR r IN
    SELECT d.runid, d.jobid, j.jobname, d.status, d.return_message, d.start_time
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE d.start_time > now() - _since
      AND d.status = 'failed'
  LOOP
    INSERT INTO public.hook_failures (hook_name, source, jobid, runid, status_code, error_message, dedupe_key)
    VALUES (r.jobname, 'cron', r.jobid, r.runid, NULL, left(COALESCE(r.return_message,''), 2000),
            'cron:' || r.runid::text)
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  -- Failed net.http_post calls (non-2xx or network error)
  FOR r IN
    SELECT resp.id, resp.status_code, resp.error_msg, resp.created, req.url
    FROM net._http_response resp
    LEFT JOIN net.http_request_queue req ON req.id = resp.id
    WHERE resp.created > now() - _since
      AND (resp.status_code IS NULL OR resp.status_code >= 400)
  LOOP
    INSERT INTO public.hook_failures (hook_name, source, status_code, error_message, payload, dedupe_key)
    VALUES (
      COALESCE(regexp_replace(r.url, '^.*/api/public/hooks/', ''), 'unknown'),
      'http',
      r.status_code,
      left(COALESCE(r.error_msg, 'HTTP ' || r.status_code), 2000),
      jsonb_build_object('url', r.url),
      'http:' || r.id::text
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.scan_cron_failures(interval) FROM public;
GRANT EXECUTE ON FUNCTION public.scan_cron_failures(interval) TO service_role;
