
-- 1. intel_entities (cross-mission registry)
CREATE TABLE public.intel_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('person','organization','source')),
  name text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  mission_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_entities TO authenticated;
GRANT ALL ON public.intel_entities TO service_role;
ALTER TABLE public.intel_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read entities" ON public.intel_entities FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write entities" ON public.intel_entities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated update entities" ON public.intel_entities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete entities" ON public.intel_entities FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

CREATE INDEX idx_intel_entities_type ON public.intel_entities(entity_type);
CREATE INDEX idx_intel_entities_mission_ids ON public.intel_entities USING gin(mission_ids);
CREATE TRIGGER trg_intel_entities_updated BEFORE UPDATE ON public.intel_entities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. intel_people
CREATE TABLE public.intel_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.intel_entities(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  role_type text NOT NULL CHECK (role_type IN ('stakeholder','evaluator','influencer','champion','expert','adversary','contact')),
  organization_entity_id uuid REFERENCES public.intel_entities(id),
  influence_level text CHECK (influence_level IN ('high','medium','low')),
  relationship_stance text CHECK (relationship_stance IN ('ally','neutral','unknown','hostile')),
  known_priorities text[] DEFAULT '{}',
  title text,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_people TO authenticated;
GRANT ALL ON public.intel_people TO service_role;
ALTER TABLE public.intel_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mission members read people" ON public.intel_people FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members write people" ON public.intel_people FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members update people" ON public.intel_people FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members delete people" ON public.intel_people FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE INDEX idx_intel_people_mission ON public.intel_people(mission_id);
CREATE INDEX idx_intel_people_entity ON public.intel_people(entity_id);

-- 3. intel_organizations
CREATE TABLE public.intel_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.intel_entities(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  org_type text NOT NULL CHECK (org_type IN ('competitor','agency','provider','advocacy','vendor','partner','subcontractor','unknown')),
  parent_entity_id uuid REFERENCES public.intel_entities(id),
  incumbency_status text CHECK (incumbency_status IN ('incumbent','challenger','unknown')),
  contract_vehicles text[] DEFAULT '{}',
  known_strengths text[] DEFAULT '{}',
  known_weaknesses text[] DEFAULT '{}',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_organizations TO authenticated;
GRANT ALL ON public.intel_organizations TO service_role;
ALTER TABLE public.intel_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mission members read orgs" ON public.intel_organizations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members write orgs" ON public.intel_organizations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members update orgs" ON public.intel_organizations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members delete orgs" ON public.intel_organizations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE INDEX idx_intel_orgs_mission ON public.intel_organizations(mission_id);
CREATE INDEX idx_intel_orgs_entity ON public.intel_organizations(entity_id);

-- 4. intel_sources
CREATE TABLE public.intel_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid REFERENCES public.intel_entities(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('rfp','amendment','report','news','interview','meeting_notes','upload','website','procurement_record','press_release')),
  url text,
  file_path text,
  published_at date,
  author text,
  credibility_score integer CHECK (credibility_score BETWEEN 1 AND 5),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_sources TO authenticated;
GRANT ALL ON public.intel_sources TO service_role;
ALTER TABLE public.intel_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mission members read sources" ON public.intel_sources FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members write sources" ON public.intel_sources FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members update sources" ON public.intel_sources FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members delete sources" ON public.intel_sources FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE INDEX idx_intel_sources_mission ON public.intel_sources(mission_id);
CREATE INDEX idx_intel_sources_entity ON public.intel_sources(entity_id);

-- 5. intel_events (the Feed)
CREATE TABLE public.intel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('signal','insight','lesson','alert','risk','extraction','amendment_change','competitive_update','stakeholder_update','research_finding')),
  title text NOT NULL,
  content text NOT NULL,
  confidence text CHECK (confidence IN ('high','medium','low')),
  generated_by text CHECK (generated_by IN ('iris','human','import','score_gap')),
  entity_refs uuid[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  source_entity_id uuid REFERENCES public.intel_entities(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_events TO authenticated;
GRANT ALL ON public.intel_events TO service_role;
ALTER TABLE public.intel_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mission members read events" ON public.intel_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members write events" ON public.intel_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members update events" ON public.intel_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_member_user(mission_id, auth.uid()) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE POLICY "mission members delete events" ON public.intel_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.is_mission_creator(mission_id, auth.uid()));
CREATE INDEX idx_intel_events_mission ON public.intel_events(mission_id);
CREATE INDEX idx_intel_events_type ON public.intel_events(mission_id, event_type);
CREATE INDEX idx_intel_events_created ON public.intel_events(mission_id, created_at DESC);
CREATE INDEX idx_intel_events_entity_refs ON public.intel_events USING gin(entity_refs);

-- 6. intel_relationships (graph edges)
CREATE TABLE public.intel_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id uuid NOT NULL REFERENCES public.intel_entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES public.intel_entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('works_for','competes_with','evaluates','influences','authored','references','funds','partners_with','subsidiary_of','contracts_with')),
  context text,
  confidence text CHECK (confidence IN ('high','medium','low')) DEFAULT 'medium',
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intel_relationships TO authenticated;
GRANT ALL ON public.intel_relationships TO service_role;
ALTER TABLE public.intel_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mission members read rels" ON public.intel_relationships FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR mission_id IS NULL
    OR public.is_mission_member_user(mission_id, auth.uid())
    OR public.is_mission_creator(mission_id, auth.uid())
  );
CREATE POLICY "mission members write rels" ON public.intel_relationships FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR mission_id IS NULL
    OR public.is_mission_member_user(mission_id, auth.uid())
    OR public.is_mission_creator(mission_id, auth.uid())
  );
CREATE POLICY "mission members update rels" ON public.intel_relationships FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR mission_id IS NULL
    OR public.is_mission_member_user(mission_id, auth.uid())
    OR public.is_mission_creator(mission_id, auth.uid())
  );
CREATE POLICY "mission members delete rels" ON public.intel_relationships FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR (mission_id IS NOT NULL AND public.is_mission_creator(mission_id, auth.uid()))
  );
CREATE INDEX idx_intel_rels_from ON public.intel_relationships(from_entity_id);
CREATE INDEX idx_intel_rels_to ON public.intel_relationships(to_entity_id);
CREATE INDEX idx_intel_rels_mission ON public.intel_relationships(mission_id);
