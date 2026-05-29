
-- stuck_flags
CREATE TABLE public.stuck_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  section_id uuid NOT NULL,
  section_name text NOT NULL,
  writer_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stuck_flags TO authenticated;
GRANT ALL ON public.stuck_flags TO service_role;
ALTER TABLE public.stuck_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY stuck_flags_select_member ON public.stuck_flags FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY stuck_flags_insert_own ON public.stuck_flags FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id) AND user_id = auth.uid());
CREATE POLICY stuck_flags_update_leadership_or_own ON public.stuck_flags FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE INDEX idx_stuck_flags_engagement_unresolved ON public.stuck_flags(engagement_id) WHERE resolved = false;

-- broadcast_reads
CREATE TABLE public.broadcast_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL,
  engagement_id uuid NOT NULL,
  member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (broadcast_id, member_id)
);
GRANT SELECT, INSERT ON public.broadcast_reads TO authenticated;
GRANT ALL ON public.broadcast_reads TO service_role;
ALTER TABLE public.broadcast_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY broadcast_reads_select_member ON public.broadcast_reads FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY broadcast_reads_insert_own ON public.broadcast_reads FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id) AND user_id = auth.uid());

CREATE INDEX idx_broadcast_reads_broadcast ON public.broadcast_reads(broadcast_id);

-- daily_checkins (anonymous, no member_id)
CREATE TABLE public.daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  response text NOT NULL CHECK (response IN ('ready','okay','struggling')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.daily_checkins TO authenticated;
GRANT ALL ON public.daily_checkins TO service_role;
ALTER TABLE public.daily_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_checkins_select_member ON public.daily_checkins FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY daily_checkins_insert_member ON public.daily_checkins FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id));

CREATE INDEX idx_daily_checkins_engagement_date ON public.daily_checkins(engagement_id, checkin_date);

-- presence availability_status
ALTER TABLE public.presence
  ADD COLUMN IF NOT EXISTS availability_status text NOT NULL DEFAULT 'available'
  CHECK (availability_status IN ('available','deep_work','away'));
