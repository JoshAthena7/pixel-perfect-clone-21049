-- ─────────────────────────────────────────────────────────────────
-- H1: Mission conflict detection
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS procurement_id TEXT;

CREATE INDEX IF NOT EXISTS idx_missions_state_procurement
  ON public.missions(state, procurement_id)
  WHERE procurement_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mission_conflict_ack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_a_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  mission_b_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  acknowledged_by UUID NOT NULL,
  justification TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mission_conflict_ack_ordered CHECK (mission_a_id < mission_b_id),
  CONSTRAINT mission_conflict_ack_unique UNIQUE (mission_a_id, mission_b_id)
);

GRANT SELECT, INSERT ON public.mission_conflict_ack TO authenticated;
GRANT ALL ON public.mission_conflict_ack TO service_role;

ALTER TABLE public.mission_conflict_ack ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mca_admin_read"
  ON public.mission_conflict_ack
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "mca_admin_insert"
  ON public.mission_conflict_ack
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND acknowledged_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- H3: Audit log performance index
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_oal_created_user_mission
  ON public.olympus_audit_log (created_at DESC, user_id, mission_id);

-- ─────────────────────────────────────────────────────────────────
-- H6: Writer right-to-deletion (soft delete + anonymisation)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.writer_identities
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_requested_by UUID,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_writer_identities_active
  ON public.writer_identities(is_active) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.writer_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  writer_email TEXT NOT NULL,
  writer_id UUID REFERENCES public.writer_identities(id) ON DELETE SET NULL,
  request_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_source TEXT CHECK (request_source IN ('email','in_app','legal')),
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  notes TEXT
);

GRANT SELECT, INSERT, UPDATE ON public.writer_deletion_requests TO authenticated;
GRANT ALL ON public.writer_deletion_requests TO service_role;

ALTER TABLE public.writer_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wdr_admin_all"
  ON public.writer_deletion_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ─────────────────────────────────────────────────────────────────
-- H7: Pulse disclosure + lead-scoped access + retention
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.writer_identities
  ADD COLUMN IF NOT EXISTS pulse_acknowledged_at TIMESTAMPTZ;

-- Also store the ack against the auth user for fast lookups in the writer UI,
-- since DailyPulse runs as the auth user and may not have a writer_identity row yet.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pulse_acknowledged_at TIMESTAMPTZ;

-- Replace platform-admin raw-row access on question_pulses with self + lead only.
DROP POLICY IF EXISTS "qp_select_self_or_admin" ON public.question_pulses;
DROP POLICY IF EXISTS "Writers see their own pulses" ON public.question_pulses;

CREATE POLICY "qp_select_self"
  ON public.question_pulses
  FOR SELECT TO authenticated
  USING (writer_auth_user_id = auth.uid());

-- Mission Leads can read pulses for writers on their specific mission only.
CREATE POLICY "qp_select_mission_lead"
  ON public.question_pulses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mission_members mm_lead
      WHERE mm_lead.mission_id = question_pulses.mission_id
        AND mm_lead.user_id = auth.uid()
        AND mm_lead.role IN ('lead','admin')
    )
  );

-- Aggregate-only view for platform admins. SECURITY INVOKER would block admins
-- (because the underlying rows aren't visible to them under the new policy), so
-- this view is intentionally a definer over aggregated columns — no free-text,
-- no per-writer disclosure.
CREATE OR REPLACE VIEW public.pulse_aggregates
WITH (security_invoker = false) AS
SELECT
  qp.mission_id,
  date_trunc('day', qp.submitted_at)::date AS day,
  COUNT(*)                                  AS pulse_count,
  COUNT(DISTINCT qp.writer_auth_user_id)    AS distinct_writers,
  AVG(qp.confidence)::numeric(4,2)          AS avg_confidence,
  AVG(qp.progress)::numeric(4,2)            AS avg_progress,
  AVG(qp.hedging_score)::numeric(4,2)       AS avg_hedging,
  ROUND(
    100.0 * SUM(CASE WHEN qp.blocked THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0),
    1
  )                                         AS blocked_pct
FROM public.question_pulses qp
GROUP BY qp.mission_id, date_trunc('day', qp.submitted_at);

REVOKE ALL ON public.pulse_aggregates FROM PUBLIC, anon;
GRANT SELECT ON public.pulse_aggregates TO authenticated;

-- Retention: null out free-text on pulses older than 90 days. All structured
-- metrics (confidence, progress, hedging, timestamps) are retained.
CREATE OR REPLACE FUNCTION public.prune_pulse_free_text()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.question_pulses
     SET blocked_reason = NULL,
         note           = NULL
   WHERE created_at < (now() - interval '90 days')
     AND (blocked_reason IS NOT NULL OR note IS NOT NULL);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_pulse_free_text() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_pulse_free_text() TO service_role;