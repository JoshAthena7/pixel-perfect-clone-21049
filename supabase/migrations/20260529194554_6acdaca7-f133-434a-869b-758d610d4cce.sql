
CREATE TABLE public.engagement_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL,
  label TEXT NOT NULL,
  due_date DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_milestones_engagement ON public.engagement_milestones(engagement_id, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_milestones TO authenticated;
GRANT ALL ON public.engagement_milestones TO service_role;

ALTER TABLE public.engagement_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY milestones_select_member ON public.engagement_milestones
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY milestones_insert_leadership ON public.engagement_milestones
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY milestones_update_leadership ON public.engagement_milestones
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY milestones_delete_leadership ON public.engagement_milestones
  FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
