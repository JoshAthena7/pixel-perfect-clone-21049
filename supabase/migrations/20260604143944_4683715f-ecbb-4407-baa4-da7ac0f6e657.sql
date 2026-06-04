
-- 1) Role enum + user_roles table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','lead','writer','sme');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role: SECURITY DEFINER to avoid recursion in policies that reference it
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Self-read only; admins can read/write all via the next two policies
DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
CREATE POLICY user_roles_self_read ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS user_roles_admin_write ON public.user_roles;
CREATE POLICY user_roles_admin_write ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) Backfill admins from legacy profiles.is_platform_admin
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'admin'::public.app_role
FROM public.profiles p
WHERE COALESCE(p.is_platform_admin, false) = true
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Rewrite admin-check functions to point at user_roles
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_olympus_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$$;

-- 4) Admin override on mission scoping helpers
CREATE OR REPLACE FUNCTION public.is_mission_member(_mission_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members
      WHERE mission_id = _mission_id AND user_id = _user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.has_mission_role(_mission_id UUID, _user_id UUID, _roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.mission_members
      WHERE mission_id = _mission_id AND user_id = _user_id AND role = ANY(_roles)
    );
$$;

-- 5) Tighten policies that violated the spec

-- score_me_history: individual scores are private to the submitter; admins can audit
DROP POLICY IF EXISTS smh_select_members ON public.score_me_history;
CREATE POLICY smh_select_submitter_or_admin ON public.score_me_history
  FOR SELECT TO authenticated
  USING (scored_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- question_pulses: individual responses private to the writer; admins can audit
DROP POLICY IF EXISTS "Mission members see mission pulses" ON public.question_pulses;
-- "Writers see their own pulses" already exists; add admin read
DROP POLICY IF EXISTS qp_select_self_or_admin ON public.question_pulses;
CREATE POLICY qp_select_self_or_admin ON public.question_pulses
  FOR SELECT TO authenticated
  USING (writer_auth_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- olympus_audit_log: admin-only read (Olympus is admin-tier per spec)
DROP POLICY IF EXISTS oal_select_members ON public.olympus_audit_log;
CREATE POLICY oal_select_admin ON public.olympus_audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
