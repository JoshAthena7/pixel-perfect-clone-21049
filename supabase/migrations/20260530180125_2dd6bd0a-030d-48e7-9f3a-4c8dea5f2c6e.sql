CREATE TABLE public.saved_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  engagement_id uuid,
  scope text NOT NULL DEFAULT 'engagement',
  question text NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  saved_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_insights TO authenticated;
GRANT ALL ON public.saved_insights TO service_role;

ALTER TABLE public.saved_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_insights_select_own"
ON public.saved_insights FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "saved_insights_insert_own"
ON public.saved_insights FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "saved_insights_delete_own"
ON public.saved_insights FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX idx_saved_insights_user ON public.saved_insights(user_id, saved_at DESC);
CREATE INDEX idx_saved_insights_engagement ON public.saved_insights(engagement_id) WHERE engagement_id IS NOT NULL;