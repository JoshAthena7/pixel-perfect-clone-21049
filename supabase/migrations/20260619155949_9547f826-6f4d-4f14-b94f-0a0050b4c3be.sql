CREATE OR REPLACE FUNCTION public.iris_pipeline_jobs_admin()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, command text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, cron
AS $$
  SELECT j.jobid, j.jobname, j.schedule, j.active, j.command
  FROM cron.job j
  WHERE j.jobname ~* '(iris|monitor|brief|intelligence|refresh|oracle|atlas|athena|backfill|generate)'
  ORDER BY j.jobname;
$$;

CREATE OR REPLACE FUNCTION public.iris_pipeline_recent_runs_admin(_jobid bigint, _limit integer DEFAULT 5)
RETURNS TABLE(runid bigint, status text, return_message text, start_time timestamptz, end_time timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, cron
AS $$
  SELECT d.runid, d.status, d.return_message, d.start_time, d.end_time
  FROM cron.job_run_details d
  WHERE d.jobid = _jobid
    AND d.start_time >= now() - interval '14 days'
  ORDER BY d.start_time DESC
  LIMIT GREATEST(_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.iris_pipeline_jobs_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.iris_pipeline_recent_runs_admin(bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.iris_pipeline_jobs_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.iris_pipeline_recent_runs_admin(bigint, integer) TO service_role;