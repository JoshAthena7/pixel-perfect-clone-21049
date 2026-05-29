CREATE TABLE public.snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  health TEXT NOT NULL,
  temperature_score INTEGER NOT NULL DEFAULT 0,
  open_sos_count INTEGER NOT NULL DEFAULT 0,
  open_risk_count INTEGER NOT NULL DEFAULT 0,
  client_sentiment TEXT,
  heatmap_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_priority TEXT,
  top_risk TEXT,
  taken_by UUID,
  taken_by_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, snapshot_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.snapshots TO authenticated;
GRANT ALL ON public.snapshots TO service_role;

ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_select_member"
ON public.snapshots FOR SELECT
TO authenticated
USING (private.is_engagement_member(engagement_id));

CREATE POLICY "snapshots_insert_leadership"
ON public.snapshots FOR INSERT
TO authenticated
WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder'::text, 'pm'::text, 'engagement_lead'::text]));

CREATE POLICY "snapshots_update_leadership"
ON public.snapshots FOR UPDATE
TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder'::text, 'pm'::text, 'engagement_lead'::text]));

CREATE POLICY "snapshots_delete_leadership"
ON public.snapshots FOR DELETE
TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder'::text, 'pm'::text, 'engagement_lead'::text]));

CREATE INDEX idx_snapshots_engagement_date ON public.snapshots(engagement_id, snapshot_date DESC);