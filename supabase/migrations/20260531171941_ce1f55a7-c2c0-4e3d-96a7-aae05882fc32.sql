-- 1) Wipe missions (user requested)
ALTER TABLE public.engagement_members DISABLE TRIGGER USER;
DELETE FROM public.engagements;
ALTER TABLE public.engagement_members ENABLE TRIGGER USER;

-- 2) Align huddles + sos_alerts with the UI
ALTER TABLE public.huddles RENAME COLUMN needs_leadership TO leadership_needed;
ALTER TABLE public.huddles ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.sos_alerts ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.sos_alerts ALTER COLUMN submitter_name DROP NOT NULL;
ALTER TABLE public.sos_alerts ALTER COLUMN submitter_name SET DEFAULT '';

-- 3) New signal tables
CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  submitted_by text NOT NULL DEFAULT 'Team',
  category text NOT NULL DEFAULT 'General',
  priority text NOT NULL DEFAULT 'Normal',
  description text NOT NULL,
  what_is_needed text,
  status text NOT NULL DEFAULT 'Open',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_requests TO authenticated;
GRANT ALL ON public.support_requests TO service_role;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read support_requests" ON public.support_requests FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write support_requests" ON public.support_requests FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update support_requests" ON public.support_requests FOR UPDATE TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete support_requests" ON public.support_requests FOR DELETE TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE TABLE IF NOT EXISTS public.quality_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  section_name text NOT NULL,
  submitted_by text NOT NULL DEFAULT 'Team',
  quality text NOT NULL DEFAULT 'Good',
  notes text,
  leadership_needed boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_signals TO authenticated;
GRANT ALL ON public.quality_signals TO service_role;
ALTER TABLE public.quality_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read quality_signals" ON public.quality_signals FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write quality_signals" ON public.quality_signals FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update quality_signals" ON public.quality_signals FOR UPDATE TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete quality_signals" ON public.quality_signals FOR DELETE TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE TABLE IF NOT EXISTS public.writer_confidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  writer text NOT NULL DEFAULT 'Team',
  section_name text NOT NULL,
  confidence smallint NOT NULL DEFAULT 3,
  notes text,
  needs_help boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.writer_confidence TO authenticated;
GRANT ALL ON public.writer_confidence TO service_role;
ALTER TABLE public.writer_confidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read writer_confidence" ON public.writer_confidence FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write writer_confidence" ON public.writer_confidence FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update writer_confidence" ON public.writer_confidence FOR UPDATE TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete writer_confidence" ON public.writer_confidence FOR DELETE TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE TABLE IF NOT EXISTS public.resource_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  submitted_by text NOT NULL DEFAULT 'Team',
  staffing text NOT NULL DEFAULT 'Adequate',
  sme_engagement text NOT NULL DEFAULT 'Good',
  timeline_status text NOT NULL DEFAULT 'On Track',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_health TO authenticated;
GRANT ALL ON public.resource_health TO service_role;
ALTER TABLE public.resource_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read resource_health" ON public.resource_health FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write resource_health" ON public.resource_health FOR INSERT TO authenticated
  WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update resource_health" ON public.resource_health FOR UPDATE TO authenticated
  USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete resource_health" ON public.resource_health FOR DELETE TO authenticated
  USING (private.is_engagement_member(engagement_id));