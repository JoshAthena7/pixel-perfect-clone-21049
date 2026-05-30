
-- 1. login_events
CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  is_new_device boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.login_events TO authenticated;
GRANT ALL ON public.login_events TO service_role;

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "login_events_insert_self" ON public.login_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "login_events_select_self_or_leadership" ON public.login_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_has_any_leadership_role(auth.uid())
  );

CREATE INDEX idx_login_events_user_created ON public.login_events(user_id, created_at DESC);
CREATE INDEX idx_login_events_fingerprint ON public.login_events(user_id, device_fingerprint);

-- 2. sensitivity on heatmap_sections
ALTER TABLE public.heatmap_sections
  ADD COLUMN sensitivity text NOT NULL DEFAULT 'standard'
  CHECK (sensitivity IN ('standard','restricted'));

-- Restrict reads: writers cannot see restricted sections
DROP POLICY IF EXISTS "heatmap_select_member" ON public.heatmap_sections;
CREATE POLICY "heatmap_select_member" ON public.heatmap_sections
  FOR SELECT TO authenticated
  USING (
    private.is_engagement_member(engagement_id)
    AND (
      sensitivity = 'standard'
      OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
    )
  );

-- 3. Tighten intel_documents — Competitive Intelligence is leadership-only
DROP POLICY IF EXISTS "intel_select_member" ON public.intel_documents;
CREATE POLICY "intel_select_member" ON public.intel_documents
  FOR SELECT TO authenticated
  USING (
    private.is_engagement_member(engagement_id)
    AND private.nda_gate_ok(engagement_id)
    AND (
      category <> 'Competitive Intelligence'
      OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
    )
  );
