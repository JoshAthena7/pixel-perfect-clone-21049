CREATE OR REPLACE FUNCTION public.is_mission_member_user(_mission_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mission_team_members mtm
    JOIN public.atlas_team_members atm ON atm.id = mtm.member_id
    JOIN auth.users u ON lower(u.email) = lower(atm.email)
    WHERE mtm.mission_id = _mission_id AND u.id = _user_id
  );
$$;

-- 1. mission_client_intelligence
CREATE TABLE public.mission_client_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'stakeholders','political_environment','incumbent','news_media',
    'legislative','cms_waivers','advocacy_groups','state_priorities'
  )),
  title text,
  content text,
  source_url text,
  date_of_intelligence date,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_client_intelligence TO authenticated;
GRANT ALL ON public.mission_client_intelligence TO service_role;
ALTER TABLE public.mission_client_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_team_select_mci" ON public.mission_client_intelligence FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()));
CREATE POLICY "admin_or_team_write_mci" ON public.mission_client_intelligence FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()));
CREATE TRIGGER trg_mci_updated_at BEFORE UPDATE ON public.mission_client_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_mci_mission ON public.mission_client_intelligence(mission_id);

-- 2. mission_documents
CREATE TABLE public.mission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN (
    'primary_rfp','amendment','attachment','scoring_criteria','prior_qa',
    'research','media_url','manual_note','other'
  )),
  title text,
  file_url text,
  source_url text,
  content_summary text,
  section_tags uuid[] NOT NULL DEFAULT '{}',
  uploaded_by uuid,
  is_amendment boolean NOT NULL DEFAULT false,
  amendment_processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_documents TO authenticated;
GRANT ALL ON public.mission_documents TO service_role;
ALTER TABLE public.mission_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_team_select_mdocs" ON public.mission_documents FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()));
CREATE POLICY "admin_or_team_write_mdocs" ON public.mission_documents FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()));
CREATE TRIGGER trg_mdocs_updated_at BEFORE UPDATE ON public.mission_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_mdocs_mission ON public.mission_documents(mission_id);

-- 3. mission_compliance_requirements
CREATE TABLE public.mission_compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  requirement text NOT NULL,
  source text,
  section_id uuid REFERENCES public.mission_sections(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.atlas_team_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'not_addressed'
    CHECK (status IN ('not_addressed','in_progress','addressed','verified')),
  is_high_risk boolean NOT NULL DEFAULT false,
  iris_extracted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_compliance_requirements TO authenticated;
GRANT ALL ON public.mission_compliance_requirements TO service_role;
ALTER TABLE public.mission_compliance_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_team_select_mcr" ON public.mission_compliance_requirements FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()));
CREATE POLICY "admin_or_team_write_mcr" ON public.mission_compliance_requirements FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()));
CREATE TRIGGER trg_mcr_updated_at BEFORE UPDATE ON public.mission_compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_mcr_mission ON public.mission_compliance_requirements(mission_id);

-- 4. mission_audit_log (append-only)
CREATE TABLE public.mission_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid,
  performed_by_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.mission_audit_log TO authenticated;
GRANT ALL ON public.mission_audit_log TO service_role;
ALTER TABLE public.mission_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_or_team_select_mal" ON public.mission_audit_log FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()));
CREATE POLICY "admin_or_team_insert_mal" ON public.mission_audit_log FOR INSERT TO authenticated
  WITH CHECK (
    (performed_by IS NULL OR performed_by = auth.uid())
    AND (public.is_platform_admin(auth.uid()) OR public.is_mission_member_user(mission_id, auth.uid()))
  );
CREATE INDEX idx_mal_mission ON public.mission_audit_log(mission_id);
CREATE INDEX idx_mal_created ON public.mission_audit_log(created_at DESC);