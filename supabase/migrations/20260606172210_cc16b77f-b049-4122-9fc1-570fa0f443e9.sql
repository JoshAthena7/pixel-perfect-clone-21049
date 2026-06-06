
-- Phase 5: Olympus strategic portfolio view tables

-- 1. IRIS portfolio intelligence (cross-mission patterns)
CREATE TYPE public.iris_portfolio_intel_type AS ENUM ('org_risk', 'capacity', 'opportunity', 'positive');

CREATE TABLE public.iris_portfolio_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type public.iris_portfolio_intel_type NOT NULL,
  headline TEXT NOT NULL,
  body TEXT NOT NULL,
  affected_mission_ids UUID[] NOT NULL DEFAULT '{}',
  action_label TEXT,
  action_filter TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.iris_portfolio_intelligence TO authenticated;
GRANT ALL ON public.iris_portfolio_intelligence TO service_role;

ALTER TABLE public.iris_portfolio_intelligence ENABLE ROW LEVEL SECURITY;

-- Any authenticated user with admin OR an executive_sponsor mission role can read.
CREATE POLICY "Exec and admin can read portfolio intel"
ON public.iris_portfolio_intelligence
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.user_id = auth.uid() AND mm.role = 'executive_sponsor'
  )
);

CREATE POLICY "Admin can write portfolio intel"
ON public.iris_portfolio_intelligence
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- 2. Executive decisions
CREATE TYPE public.executive_decision_urgency AS ENUM ('urgent', 'standard');
CREATE TYPE public.executive_decision_source AS ENUM ('team', 'iris');
CREATE TYPE public.executive_decision_status AS ENUM ('pending', 'decided', 'delegated', 'needs_context');

CREATE TABLE public.executive_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  urgency public.executive_decision_urgency NOT NULL DEFAULT 'standard',
  source public.executive_decision_source NOT NULL DEFAULT 'team',
  status public.executive_decision_status NOT NULL DEFAULT 'pending',
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_decisions TO authenticated;
GRANT ALL ON public.executive_decisions TO service_role;

ALTER TABLE public.executive_decisions ENABLE ROW LEVEL SECURITY;

-- Exec sponsors and admins can read everything
CREATE POLICY "Exec and admin can read all decisions"
ON public.executive_decisions
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.user_id = auth.uid() AND mm.role = 'executive_sponsor'
  )
  OR submitted_by = auth.uid()
);

-- Leads/PMs/admins can insert
CREATE POLICY "Leads can submit decisions"
ON public.executive_decisions
FOR INSERT
TO authenticated
WITH CHECK (
  submitted_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
    OR (mission_id IS NULL AND EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.user_id = auth.uid()
        AND mm.role IN ('admin','lead','engagement_lead','project_manager')
    ))
    OR (mission_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.mission_members mm
      WHERE mm.user_id = auth.uid()
        AND mm.mission_id = executive_decisions.mission_id
        AND mm.role IN ('admin','lead','engagement_lead','project_manager')
    ))
  )
);

-- Only exec sponsors and admins can update status (decide/delegate/etc.)
CREATE POLICY "Exec and admin can update decisions"
ON public.executive_decisions
FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  OR EXISTS (
    SELECT 1 FROM public.mission_members mm
    WHERE mm.user_id = auth.uid() AND mm.role = 'executive_sponsor'
  )
);

CREATE INDEX idx_exec_decisions_status_created ON public.executive_decisions (status, created_at DESC);
CREATE INDEX idx_portfolio_intel_active ON public.iris_portfolio_intelligence (dismissed_at, generated_at DESC);

-- Seed sample portfolio intelligence so the panel renders on first load.
INSERT INTO public.iris_portfolio_intelligence (type, headline, body, action_label, action_filter)
VALUES
  ('org_risk',
   'Cost management positioning is weak across multiple active missions',
   'Cost management win-theme alignment is averaging below threshold on several active missions. This is a strategy gap, not a mission-specific issue — the organization may need updated cost narrative assets that all missions can draw from.',
   'View affected missions', 'health=red,yellow'),
  ('capacity',
   'SME response delays detected across multiple missions',
   'Sections collectively waiting on subject matter input are averaging multiple days overdue. Some SMEs are shared across several missions — competing demand may be the root cause.',
   'View SME assignments', 'sme'),
  ('opportunity',
   'New CMS guidance relevant to multiple active missions',
   'Recently published federal guidance is relevant to several active missions. Most have not yet incorporated it into their Intel or section content.',
   'See affected missions', 'opportunity'),
  ('positive',
   'Portfolio win-theme alignment trending upward',
   'Win-theme alignment has improved across the active mission portfolio over the past two weeks.',
   NULL, NULL);
