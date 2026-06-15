-- Extend mission_milestones
ALTER TABLE public.mission_milestones
  ADD COLUMN IF NOT EXISTS milestone_time time,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hard_deadline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pens_down boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source text
    CONSTRAINT mm_source_check CHECK (source IN ('original_rfp','amendment','leader_set','client_directive')),
  ADD COLUMN IF NOT EXISTS source_document_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mission_documents')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mm_source_doc_fk') THEN
    ALTER TABLE public.mission_milestones
      ADD CONSTRAINT mm_source_doc_fk FOREIGN KEY (source_document_id)
      REFERENCES public.mission_documents(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='mm_updated_at' AND tgrelid='public.mission_milestones'::regclass) THEN
    CREATE TRIGGER mm_updated_at BEFORE UPDATE ON public.mission_milestones
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mm_pens_down
  ON public.mission_milestones(mission_id, is_pens_down) WHERE is_pens_down = true;
CREATE INDEX IF NOT EXISTS idx_mm_external
  ON public.mission_milestones(mission_id, is_external, milestone_date);

-- milestone_changes
CREATE TABLE IF NOT EXISTS public.milestone_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.mission_milestones(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  previous_date date NOT NULL,
  new_date date NOT NULL,
  days_delta integer GENERATED ALWAYS AS (new_date - previous_date) STORED,
  change_reason text,
  change_source text NOT NULL
    CONSTRAINT mc_source CHECK (change_source IN ('state_amendment','client_directive','leader_decision','system_cascade')),
  source_document_id uuid,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_milestone ON public.milestone_changes(milestone_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_mc_mission ON public.milestone_changes(mission_id, changed_at DESC);

GRANT SELECT, INSERT ON public.milestone_changes TO authenticated;
GRANT ALL ON public.milestone_changes TO service_role;
ALTER TABLE public.milestone_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY mc_select ON public.milestone_changes FOR SELECT TO authenticated
  USING (private.is_engagement_member(mission_id));
CREATE POLICY mc_insert ON public.milestone_changes FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY mc_service ON public.milestone_changes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- question_deadlines
CREATE TABLE IF NOT EXISTS public.question_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.mission_questions(id) ON DELETE CASCADE,
  deadline_type text NOT NULL
    CONSTRAINT qd_type CHECK (deadline_type IN ('first_draft','sme_input_due','graphics_due','internal_review','pens_down','final')),
  due_date date NOT NULL,
  is_at_risk boolean NOT NULL DEFAULT false,
  is_missed boolean NOT NULL DEFAULT false,
  set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, deadline_type)
);

CREATE INDEX IF NOT EXISTS idx_qd_question ON public.question_deadlines(question_id);
CREATE INDEX IF NOT EXISTS idx_qd_mission ON public.question_deadlines(mission_id, due_date);
CREATE INDEX IF NOT EXISTS idx_qd_at_risk ON public.question_deadlines(mission_id, is_at_risk) WHERE is_at_risk = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_deadlines TO authenticated;
GRANT ALL ON public.question_deadlines TO service_role;
ALTER TABLE public.question_deadlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY qd_select ON public.question_deadlines FOR SELECT TO authenticated
  USING (private.is_engagement_member(mission_id));
CREATE POLICY qd_write ON public.question_deadlines FOR ALL TO authenticated
  USING (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_engagement_role(mission_id, ARRAY['founder','pm','engagement_lead'])
    OR public.is_platform_admin(auth.uid()));
CREATE POLICY qd_service ON public.question_deadlines FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER qd_updated_at BEFORE UPDATE ON public.question_deadlines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- athena_intelligence_map: ensure all four GIN indexes
CREATE INDEX IF NOT EXISTS idx_aim_states ON public.athena_intelligence_map USING gin(applicable_states);
CREATE INDEX IF NOT EXISTS idx_aim_programs ON public.athena_intelligence_map USING gin(applicable_programs);
CREATE INDEX IF NOT EXISTS idx_aim_waivers ON public.athena_intelligence_map USING gin(applicable_waivers);
CREATE INDEX IF NOT EXISTS idx_aim_populations ON public.athena_intelligence_map USING gin(applicable_populations);

-- oracle_engagement_config: mission_profile
ALTER TABLE public.oracle_engagement_config
  ADD COLUMN IF NOT EXISTS mission_profile jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.oracle_engagement_config.mission_profile IS
  'AI-generated mission intelligence profile. Populated by Phase 5 source seed generator. Contains governing authorities, key agencies, policy signals, academic sources, and advocacy ecosystem.';