
-- Create 6 missing tables referenced by pulse.tsx
CREATE TABLE public.differentiators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  substantiation text,
  versus text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.differentiators TO authenticated;
GRANT ALL ON public.differentiators TO service_role;
ALTER TABLE public.differentiators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read differentiators" ON public.differentiators FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write differentiators" ON public.differentiators FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update differentiators" ON public.differentiators FOR UPDATE TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete differentiators" ON public.differentiators FOR DELETE TO authenticated USING (private.is_engagement_member(engagement_id));

CREATE TABLE public.stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  organization text,
  relationship text,
  priority text DEFAULT 'Medium',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stakeholders TO authenticated;
GRANT ALL ON public.stakeholders TO service_role;
ALTER TABLE public.stakeholders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read stakeholders" ON public.stakeholders FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write stakeholders" ON public.stakeholders FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update stakeholders" ON public.stakeholders FOR UPDATE TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete stakeholders" ON public.stakeholders FOR DELETE TO authenticated USING (private.is_engagement_member(engagement_id));

CREATE TABLE public.partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  role text,
  commitment text DEFAULT 'Exploring',
  contact text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partnerships TO authenticated;
GRANT ALL ON public.partnerships TO service_role;
ALTER TABLE public.partnerships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read partnerships" ON public.partnerships FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write partnerships" ON public.partnerships FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update partnerships" ON public.partnerships FOR UPDATE TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete partnerships" ON public.partnerships FOR DELETE TO authenticated USING (private.is_engagement_member(engagement_id));

CREATE TABLE public.assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  text text NOT NULL,
  confidence text DEFAULT 'Medium',
  risk_if_wrong text,
  owner text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assumptions TO authenticated;
GRANT ALL ON public.assumptions TO service_role;
ALTER TABLE public.assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read assumptions" ON public.assumptions FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write assumptions" ON public.assumptions FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update assumptions" ON public.assumptions FOR UPDATE TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete assumptions" ON public.assumptions FOR DELETE TO authenticated USING (private.is_engagement_member(engagement_id));

CREATE TABLE public.terminology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  term text NOT NULL,
  definition text,
  preferred_usage text,
  context text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.terminology TO authenticated;
GRANT ALL ON public.terminology TO service_role;
ALTER TABLE public.terminology ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read terminology" ON public.terminology FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write terminology" ON public.terminology FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update terminology" ON public.terminology FOR UPDATE TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete terminology" ON public.terminology FOR DELETE TO authenticated USING (private.is_engagement_member(engagement_id));

CREATE TABLE public.change_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  change_type text NOT NULL,
  item_name text,
  description text,
  impact text,
  logged_by text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.change_tracker TO authenticated;
GRANT ALL ON public.change_tracker TO service_role;
ALTER TABLE public.change_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can read change_tracker" ON public.change_tracker FOR SELECT TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can write change_tracker" ON public.change_tracker FOR INSERT TO authenticated WITH CHECK (private.is_engagement_member(engagement_id));
CREATE POLICY "members can update change_tracker" ON public.change_tracker FOR UPDATE TO authenticated USING (private.is_engagement_member(engagement_id));
CREATE POLICY "members can delete change_tracker" ON public.change_tracker FOR DELETE TO authenticated USING (private.is_engagement_member(engagement_id));
