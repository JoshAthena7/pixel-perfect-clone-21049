
CREATE POLICY "leadership can insert runs" ON public.holy_grail_runs
FOR INSERT TO authenticated
WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "leadership can update runs" ON public.holy_grail_runs
FOR UPDATE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']))
WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
