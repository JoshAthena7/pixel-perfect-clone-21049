
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS prime_contractor TEXT,
  ADD COLUMN IF NOT EXISTS engagement_type TEXT,
  ADD COLUMN IF NOT EXISTS internal_lead TEXT,
  ADD COLUMN IF NOT EXISTS operations_lead TEXT,
  ADD COLUMN IF NOT EXISTS engagement_lead TEXT,
  ADD COLUMN IF NOT EXISTS wizard_step INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS atlas_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closeout_notes JSONB,
  ADD COLUMN IF NOT EXISTS closeout_checklist JSONB DEFAULT '{}'::jsonb;

-- state and program_type already exist on missions; skip to avoid type conflicts.

CREATE TABLE IF NOT EXISTS public.mission_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  notes TEXT,
  iris_processed BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_documents TO authenticated;
GRANT ALL ON public.mission_documents TO service_role;
ALTER TABLE public.mission_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access mission_documents"
  ON public.mission_documents FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mission_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  assigned_sections JSONB DEFAULT '[]'::jsonb,
  talentdesk_status TEXT DEFAULT 'pending',
  contract_status TEXT DEFAULT 'pending',
  nda_status TEXT DEFAULT 'pending',
  baa_required BOOLEAN DEFAULT false,
  baa_status TEXT DEFAULT 'not_required',
  client_system_access BOOLEAN DEFAULT false,
  slack_access BOOLEAN DEFAULT false,
  folder_access BOOLEAN DEFAULT false,
  start_date DATE,
  invite_sent_at TIMESTAMPTZ,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_team_members TO authenticated;
GRANT ALL ON public.mission_team_members TO service_role;
ALTER TABLE public.mission_team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access mission_team_members"
  ON public.mission_team_members FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.mission_readiness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID UNIQUE NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  contracts_complete BOOLEAN DEFAULT false,
  talentdesk_active BOOLEAN DEFAULT false,
  required_forms_complete BOOLEAN DEFAULT false,
  client_access_requested BOOLEAN DEFAULT false,
  slack_channels_ready BOOLEAN DEFAULT false,
  folders_created BOOLEAN DEFAULT false,
  kickoff_materials_ready BOOLEAN DEFAULT false,
  assignments_reviewed BOOLEAN DEFAULT false,
  security_acknowledgments_complete BOOLEAN DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_readiness TO authenticated;
GRANT ALL ON public.mission_readiness TO service_role;
ALTER TABLE public.mission_readiness ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access mission_readiness"
  ON public.mission_readiness FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
CREATE TRIGGER mission_readiness_set_updated_at
  BEFORE UPDATE ON public.mission_readiness
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.mission_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id),
  change_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  synced_to_atlas BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_change_log TO authenticated;
GRANT ALL ON public.mission_change_log TO service_role;
ALTER TABLE public.mission_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access mission_change_log"
  ON public.mission_change_log FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
