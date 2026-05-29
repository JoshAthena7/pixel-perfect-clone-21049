-- =========== PROFILES ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========== ENGAGEMENTS ===========
CREATE TABLE public.engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client TEXT NOT NULL,
  submission_date DATE,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Closed','Archived')),
  slack_webhook TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagements TO authenticated;
GRANT ALL ON public.engagements TO service_role;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;

-- =========== ENGAGEMENT MEMBERS ===========
CREATE TABLE public.engagement_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('founder','pm','engagement_lead','viewer')),
  display_name TEXT NOT NULL,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (engagement_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.engagement_members TO authenticated;
GRANT ALL ON public.engagement_members TO service_role;
ALTER TABLE public.engagement_members ENABLE ROW LEVEL SECURITY;

-- Helper: is current user a member of engagement?
CREATE OR REPLACE FUNCTION public.is_engagement_member(_engagement_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE engagement_id = _engagement_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_engagement_role(_engagement_id UUID, _roles TEXT[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagement_members
    WHERE engagement_id = _engagement_id AND user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

CREATE POLICY "engagements_select_member" ON public.engagements FOR SELECT TO authenticated
  USING (public.is_engagement_member(id));
CREATE POLICY "engagements_insert_authenticated" ON public.engagements FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "engagements_update_leadership" ON public.engagements FOR UPDATE TO authenticated
  USING (public.has_engagement_role(id, ARRAY['founder','pm']));
CREATE POLICY "engagements_delete_founder" ON public.engagements FOR DELETE TO authenticated
  USING (public.has_engagement_role(id, ARRAY['founder']));

CREATE POLICY "members_select_self_engagement" ON public.engagement_members FOR SELECT TO authenticated
  USING (public.is_engagement_member(engagement_id));
CREATE POLICY "members_insert_leadership" ON public.engagement_members FOR INSERT TO authenticated
  WITH CHECK (
    public.has_engagement_role(engagement_id, ARRAY['founder','pm'])
    OR NOT EXISTS (SELECT 1 FROM public.engagement_members WHERE engagement_id = engagement_members.engagement_id)
  );
CREATE POLICY "members_update_leadership" ON public.engagement_members FOR UPDATE TO authenticated
  USING (public.has_engagement_role(engagement_id, ARRAY['founder','pm']));
CREATE POLICY "members_delete_leadership" ON public.engagement_members FOR DELETE TO authenticated
  USING (public.has_engagement_role(engagement_id, ARRAY['founder','pm']));

-- =========== HUDDLES ===========
CREATE TABLE public.huddles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  submitter_name TEXT NOT NULL,
  health TEXT NOT NULL CHECK (health IN ('Green','Yellow','Red')),
  priority TEXT NOT NULL,
  risk TEXT,
  client_concern TEXT,
  writer_concern TEXT,
  needs_leadership BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.huddles TO authenticated;
GRANT ALL ON public.huddles TO service_role;
ALTER TABLE public.huddles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "huddles_select_member" ON public.huddles FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "huddles_insert_member" ON public.huddles FOR INSERT TO authenticated WITH CHECK (public.is_engagement_member(engagement_id) AND submitted_by = auth.uid());

-- =========== SOS ===========
CREATE TABLE public.sos_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  submitter_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Writer Issue','SME Issue','Client Issue','Scope Issue','Timeline Issue','Compliance Issue','Internal Team Issue','Other')),
  severity TEXT NOT NULL CHECK (severity IN ('Yellow','Orange','Red')),
  description TEXT NOT NULL,
  recommended_action TEXT,
  owner_name TEXT,
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sos_alerts TO authenticated;
GRANT ALL ON public.sos_alerts TO service_role;
ALTER TABLE public.sos_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sos_select_member" ON public.sos_alerts FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "sos_insert_member" ON public.sos_alerts FOR INSERT TO authenticated WITH CHECK (public.is_engagement_member(engagement_id) AND submitted_by = auth.uid());
CREATE POLICY "sos_update_leadership" ON public.sos_alerts FOR UPDATE TO authenticated USING (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- =========== RISKS ===========
CREATE TABLE public.risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_name TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('Low','Medium','High')),
  likelihood TEXT NOT NULL CHECK (likelihood IN ('Low','Medium','High')),
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Monitoring','Mitigated','Closed')),
  target_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risks TO authenticated;
GRANT ALL ON public.risks TO service_role;
ALTER TABLE public.risks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risks_select_member" ON public.risks FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "risks_write_leadership" ON public.risks FOR INSERT TO authenticated WITH CHECK (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));
CREATE POLICY "risks_update_leadership" ON public.risks FOR UPDATE TO authenticated USING (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- =========== HEATMAP ===========
CREATE TABLE public.heatmap_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  section_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Green' CHECK (status IN ('Green','Yellow','Orange','Red')),
  notes TEXT,
  updated_by_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  sort_order INTEGER DEFAULT 0,
  UNIQUE (engagement_id, section_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.heatmap_sections TO authenticated;
GRANT ALL ON public.heatmap_sections TO service_role;
ALTER TABLE public.heatmap_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heatmap_select_member" ON public.heatmap_sections FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "heatmap_update_leadership" ON public.heatmap_sections FOR UPDATE TO authenticated USING (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- =========== INTEL DOCUMENTS ===========
CREATE TABLE public.intel_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('RFP','Amendment','Q&A Document','State Intelligence','Competitive Intelligence','Meeting Notes','Client Direction','Leadership Guidance','Other')),
  notes TEXT,
  url TEXT,
  file_path TEXT,
  uploader_name TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_documents TO authenticated;
GRANT ALL ON public.intel_documents TO service_role;
ALTER TABLE public.intel_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intel_select_member" ON public.intel_documents FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "intel_insert_member" ON public.intel_documents FOR INSERT TO authenticated WITH CHECK (public.is_engagement_member(engagement_id));

-- =========== DECISIONS ===========
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_name TEXT,
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rationale TEXT,
  impacted_areas TEXT,
  status TEXT NOT NULL DEFAULT 'Final' CHECK (status IN ('Final','Pending Confirmation','Revisited')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decisions_select_member" ON public.decisions FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "decisions_write_leadership" ON public.decisions FOR INSERT TO authenticated WITH CHECK (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- =========== CLIENT PULSES ===========
CREATE TABLE public.client_pulses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  recorded_by UUID NOT NULL REFERENCES auth.users(id),
  recorder_name TEXT NOT NULL,
  interaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('Happy','Neutral','Concerned')),
  summary TEXT NOT NULL,
  action_items TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_pulses TO authenticated;
GRANT ALL ON public.client_pulses TO service_role;
ALTER TABLE public.client_pulses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pulses_select_member" ON public.client_pulses FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "pulses_write_leadership" ON public.client_pulses FOR INSERT TO authenticated WITH CHECK (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- =========== BROADCASTS ===========
CREATE TABLE public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id),
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcasts_select_member" ON public.broadcasts FOR SELECT TO authenticated USING (public.is_engagement_member(engagement_id));
CREATE POLICY "broadcasts_insert_leadership" ON public.broadcasts FOR INSERT TO authenticated WITH CHECK (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']) AND author_id = auth.uid());
CREATE POLICY "broadcasts_update_leadership" ON public.broadcasts FOR UPDATE TO authenticated USING (public.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

-- =========== AUTO-SEED on engagement creation ===========
CREATE OR REPLACE FUNCTION public.seed_engagement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_display TEXT;
BEGIN
  -- Add creator as founder
  SELECT display_name INTO v_display FROM public.profiles WHERE id = NEW.created_by;
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.engagement_members (engagement_id, user_id, role, display_name)
    VALUES (NEW.id, NEW.created_by, 'founder', COALESCE(v_display, 'Founder'))
    ON CONFLICT (engagement_id, user_id) DO NOTHING;
  END IF;

  -- Seed 9 heat map sections
  INSERT INTO public.heatmap_sections (engagement_id, section_name, status, sort_order) VALUES
    (NEW.id, 'LTSS', 'Green', 1),
    (NEW.id, 'Care Management', 'Green', 2),
    (NEW.id, 'Quality', 'Green', 3),
    (NEW.id, 'Behavioral Health', 'Green', 4),
    (NEW.id, 'Operations', 'Green', 5),
    (NEW.id, 'Implementation', 'Green', 6),
    (NEW.id, 'Transition', 'Green', 7),
    (NEW.id, 'IT/Systems', 'Green', 8),
    (NEW.id, 'Staffing/HR', 'Green', 9);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_engagement_created
AFTER INSERT ON public.engagements
FOR EACH ROW EXECUTE FUNCTION public.seed_engagement();

-- =========== REALTIME ===========
ALTER PUBLICATION supabase_realtime ADD TABLE public.huddles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sos_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.heatmap_sections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_pulses;

-- =========== STORAGE BUCKET for intel files ===========
INSERT INTO storage.buckets (id, name, public) VALUES ('intel-files', 'intel-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "intel_files_member_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'intel-files'
  AND public.is_engagement_member((storage.foldername(name))[1]::uuid)
);
CREATE POLICY "intel_files_member_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'intel-files'
  AND public.is_engagement_member((storage.foldername(name))[1]::uuid)
);