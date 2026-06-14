CREATE OR REPLACE FUNCTION public.iris_pipeline_recent_runs(_jobid bigint, _limit integer DEFAULT 20)
 RETURNS TABLE(runid bigint, status text, return_message text, start_time timestamp with time zone, end_time timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  SELECT d.runid, d.status, d.return_message, d.start_time, d.end_time
  FROM cron.job_run_details d
  WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
    AND d.jobid = _jobid
    AND d.start_time >= now() - interval '14 days'
  ORDER BY d.start_time DESC
  LIMIT GREATEST(_limit, 1);
$function$;