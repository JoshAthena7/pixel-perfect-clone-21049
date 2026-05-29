
REVOKE SELECT (slack_webhook) ON public.engagements FROM authenticated, anon;

GRANT SELECT (id, name, client, status, submission_date, created_at, created_by)
  ON public.engagements TO authenticated;

CREATE OR REPLACE FUNCTION public.get_engagement_slack_webhook(_engagement_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT slack_webhook
  FROM public.engagements
  WHERE id = _engagement_id
    AND private.has_engagement_role(_engagement_id, ARRAY['founder','pm','engagement_lead']);
$$;

REVOKE EXECUTE ON FUNCTION public.get_engagement_slack_webhook(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_engagement_slack_webhook(uuid) TO authenticated;
