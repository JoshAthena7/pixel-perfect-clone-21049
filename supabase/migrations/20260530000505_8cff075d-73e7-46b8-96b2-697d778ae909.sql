CREATE TABLE public.attention_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  type text NOT NULL,
  source_key text NOT NULL,
  acknowledged_by uuid NOT NULL,
  acknowledged_by_name text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, type, source_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attention_acks TO authenticated;
GRANT ALL ON public.attention_acks TO service_role;

ALTER TABLE public.attention_acks ENABLE ROW LEVEL SECURITY;

CREATE POLICY attention_acks_select_member ON public.attention_acks
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY attention_acks_insert_leadership ON public.attention_acks
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']) AND acknowledged_by = auth.uid());