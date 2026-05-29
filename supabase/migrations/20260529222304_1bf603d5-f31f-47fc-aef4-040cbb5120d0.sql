CREATE POLICY "risks_insert_member"
ON public.risks
FOR INSERT
TO authenticated
WITH CHECK (private.is_engagement_member(engagement_id) AND created_by = auth.uid());