DROP POLICY IF EXISTS engagements_select_creator ON public.engagements;

CREATE POLICY engagements_select_creator
ON public.engagements
FOR SELECT
TO authenticated
USING (created_by = auth.uid());