
CREATE TABLE public.atlas_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- TalentDesk fields
  talentdesk_id TEXT,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  job_title TEXT,
  phone TEXT,
  address TEXT,
  avatar_url TEXT,
  skills TEXT[] DEFAULT '{}'::text[],
  languages TEXT[] DEFAULT '{}'::text[],
  talentdesk_status TEXT CHECK (talentdesk_status IN ('approved','pending_onboarding')),
  talentdesk_date_joined DATE,
  talentdesk_last_login TIMESTAMPTZ,
  talentdesk_invited_by TEXT,
  -- ATLAS-managed fields
  atlas_role TEXT NOT NULL DEFAULT 'unassigned' CHECK (atlas_role IN ('admin','engagement_lead','writer','sme','reviewer','unassigned')),
  atlas_invite_status TEXT NOT NULL DEFAULT 'not_invited' CHECK (atlas_invite_status IN ('not_invited','invite_sent','active','never_logged_in','onboarding_incomplete')),
  atlas_invite_sent_at TIMESTAMPTZ,
  atlas_first_login_at TIMESTAMPTZ,
  atlas_last_active_at TIMESTAMPTZ,
  atlas_profile_completeness INTEGER NOT NULL DEFAULT 0,
  atlas_onboarding_complete BOOLEAN NOT NULL DEFAULT false,
  atlas_hipaa_acknowledged BOOLEAN NOT NULL DEFAULT false,
  atlas_hipaa_acknowledged_at TIMESTAMPTZ,
  atlas_resume_url TEXT,
  admin_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_removed BOOLEAN NOT NULL DEFAULT false,
  removed_at TIMESTAMPTZ,
  removed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_team_members TO authenticated;
GRANT ALL ON public.atlas_team_members TO service_role;

ALTER TABLE public.atlas_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view atlas_team_members"
  ON public.atlas_team_members FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can insert atlas_team_members"
  ON public.atlas_team_members FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can update atlas_team_members"
  ON public.atlas_team_members FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can delete atlas_team_members"
  ON public.atlas_team_members FOR DELETE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE INDEX idx_atlas_team_members_email ON public.atlas_team_members (lower(email));
CREATE INDEX idx_atlas_team_members_atlas_role ON public.atlas_team_members (atlas_role);
CREATE INDEX idx_atlas_team_members_invite_status ON public.atlas_team_members (atlas_invite_status);

CREATE TRIGGER trg_atlas_team_members_updated_at
  BEFORE UPDATE ON public.atlas_team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.atlas_team_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_by TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  records_added INTEGER NOT NULL DEFAULT 0,
  records_updated INTEGER NOT NULL DEFAULT 0,
  records_flagged INTEGER NOT NULL DEFAULT 0,
  conflicts JSONB NOT NULL DEFAULT '[]'::jsonb
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.atlas_team_sync_log TO authenticated;
GRANT ALL ON public.atlas_team_sync_log TO service_role;

ALTER TABLE public.atlas_team_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can view atlas_team_sync_log"
  ON public.atlas_team_sync_log FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can insert atlas_team_sync_log"
  ON public.atlas_team_sync_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can update atlas_team_sync_log"
  ON public.atlas_team_sync_log FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins can delete atlas_team_sync_log"
  ON public.atlas_team_sync_log FOR DELETE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE INDEX idx_atlas_team_sync_log_synced_at ON public.atlas_team_sync_log (synced_at DESC);
