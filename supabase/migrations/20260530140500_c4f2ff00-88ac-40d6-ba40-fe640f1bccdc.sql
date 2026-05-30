
-- ============================================================================
-- Performance indexes for common query patterns
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_engagement_members_eng_user ON public.engagement_members(engagement_id, user_id);
CREATE INDEX IF NOT EXISTS idx_section_assignments_eng_user ON public.section_assignments(engagement_id, user_id);
CREATE INDEX IF NOT EXISTS idx_sos_alerts_eng_status ON public.sos_alerts(engagement_id, status);
CREATE INDEX IF NOT EXISTS idx_risks_eng_status ON public.risks(engagement_id, status);
CREATE INDEX IF NOT EXISTS idx_stuck_flags_eng_resolved ON public.stuck_flags(engagement_id, resolved);
CREATE INDEX IF NOT EXISTS idx_nudges_recipient_read ON public.nudges(recipient_id, read);
CREATE INDEX IF NOT EXISTS idx_quick_chats_recipient_read_exp ON public.quick_chats(recipient_id, read, expires_at);
CREATE INDEX IF NOT EXISTS idx_presence_eng_status ON public.presence(engagement_id, availability_status);

-- ============================================================================
-- Activity log: lightweight audit trail of significant war-room events
-- ============================================================================
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL,
  user_id UUID,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Only leadership can read the audit log
CREATE POLICY activity_log_select_leadership
  ON public.activity_log
  FOR SELECT
  TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- Any engagement member may insert log rows for events they perform
CREATE POLICY activity_log_insert_member
  ON public.activity_log
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id) AND (user_id = auth.uid() OR user_id IS NULL));

CREATE INDEX idx_activity_log_eng_created ON public.activity_log(engagement_id, created_at DESC);
