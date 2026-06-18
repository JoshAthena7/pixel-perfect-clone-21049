CREATE OR REPLACE FUNCTION public.athena_pipeline_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean, last_run_at timestamptz, last_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, cron
AS $$
  SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    (SELECT MAX(r.start_time) FROM cron.job_run_details r WHERE r.jobid = j.jobid) AS last_run_at,
    (SELECT r.status FROM cron.job_run_details r WHERE r.jobid = j.jobid ORDER BY r.start_time DESC LIMIT 1) AS last_status
  FROM cron.job j
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
    AND j.jobname IN (
      'atlas-daily-focus-generator',
      'atlas-daily-moments',
      'atlas-daily-health-recalc'
    )
  ORDER BY j.jobname;
$$;

GRANT EXECUTE ON FUNCTION public.athena_pipeline_jobs() TO authenticated;