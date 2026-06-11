CREATE OR REPLACE FUNCTION public.iris_pipeline_jobs()
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  command text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT j.jobid, j.jobname, j.schedule, j.active, j.command
  FROM cron.job j
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
    AND j.jobname ~* '(iris|monitor|brief|intelligence|refresh)'
  ORDER BY j.jobname;
$$;

CREATE OR REPLACE FUNCTION public.iris_pipeline_recent_runs(_jobid bigint, _limit int DEFAULT 20)
RETURNS TABLE(
  runid bigint,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $$
  SELECT d.runid, d.status, d.return_message, d.start_time, d.end_time
  FROM cron.job_run_details d
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
    AND d.jobid = _jobid
  ORDER BY d.start_time DESC
  LIMIT GREATEST(_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.iris_pipeline_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.iris_pipeline_recent_runs(bigint, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.iris_pipeline_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.iris_pipeline_recent_runs(bigint, int) TO authenticated;