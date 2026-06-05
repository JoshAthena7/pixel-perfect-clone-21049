
-- helper: is current user a member of a mission?
CREATE OR REPLACE FUNCTION public.is_mission_member(_mission_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mission_members
    WHERE mission_id = _mission_id AND user_id = _user_id
  );
$$;

-- helper: platform admin check (reuses platform_admins table if present)
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- mission_strategy
CREATE TABLE IF NOT EXISTS public.mission_strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('discriminator','proof_point','client_priority','competitor','risk')),
  label text NOT NULL,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mission_strategy_mission ON public.mission_strategy(mission_id, kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_strategy TO authenticated;
GRANT ALL ON public.mission_strategy TO service_role;
ALTER TABLE public.mission_strategy ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw mission_strategy" ON public.mission_strategy FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- mission_client_intel (one row per mission)
CREATE TABLE IF NOT EXISTS public.mission_client_intel (
  mission_id uuid PRIMARY KEY REFERENCES public.missions(id) ON DELETE CASCADE,
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  stakeholders jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_makers jsonb NOT NULL DEFAULT '[]'::jsonb,
  relationship_owners jsonb NOT NULL DEFAULT '[]'::jsonb,
  political_considerations text,
  meeting_cadence text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_client_intel TO authenticated;
GRANT ALL ON public.mission_client_intel TO service_role;
ALTER TABLE public.mission_client_intel ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw mission_client_intel" ON public.mission_client_intel FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- mission_timeline
CREATE TABLE IF NOT EXISTS public.mission_timeline (
  mission_id uuid PRIMARY KEY REFERENCES public.missions(id) ON DELETE CASCADE,
  question_deadline timestamptz,
  draft_deadlines jsonb NOT NULL DEFAULT '[]'::jsonb,
  pink_team timestamptz,
  red_team timestamptz,
  gold_team timestamptz,
  exec_review timestamptz,
  submission timestamptz,
  orals timestamptz,
  award timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_timeline TO authenticated;
GRANT ALL ON public.mission_timeline TO service_role;
ALTER TABLE public.mission_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw mission_timeline" ON public.mission_timeline FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- mission_volumes
CREATE TABLE IF NOT EXISTS public.mission_volumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mission_volumes_mission ON public.mission_volumes(mission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_volumes TO authenticated;
GRANT ALL ON public.mission_volumes TO service_role;
ALTER TABLE public.mission_volumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw mission_volumes" ON public.mission_volumes FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- mission_governance
CREATE TABLE IF NOT EXISTS public.mission_governance (
  mission_id uuid PRIMARY KEY REFERENCES public.missions(id) ON DELETE CASCADE,
  approval_workflow jsonb NOT NULL DEFAULT '[]'::jsonb,
  escalation_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  leadership_gates jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality_gates jsonb NOT NULL DEFAULT '[]'::jsonb,
  submission_authority text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_governance TO authenticated;
GRANT ALL ON public.mission_governance TO service_role;
ALTER TABLE public.mission_governance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw mission_governance" ON public.mission_governance FOR ALL TO authenticated
  USING (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_mission_member(mission_id, auth.uid()) OR public.is_platform_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- mission_financials (admin-only)
CREATE TABLE IF NOT EXISTS public.mission_financials (
  mission_id uuid PRIMARY KEY REFERENCES public.missions(id) ON DELETE CASCADE,
  sow text,
  budget numeric,
  hours numeric,
  consultants jsonb NOT NULL DEFAULT '[]'::jsonb,
  tracking jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_financials TO authenticated;
GRANT ALL ON public.mission_financials TO service_role;
ALTER TABLE public.mission_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins rw mission_financials" ON public.mission_financials FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- ─────────────────────────────────────────────────────────────
-- Extend existing tables
ALTER TABLE public.mission_vault_documents ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS volume_id uuid REFERENCES public.mission_volumes(id) ON DELETE SET NULL;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS reviewer_id uuid;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS review_path text CHECK (review_path IN ('sequential','parallel'));
