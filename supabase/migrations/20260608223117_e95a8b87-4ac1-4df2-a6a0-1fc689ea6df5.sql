-- Tables questions / question_assignments / question_intelligence and
-- missions.assignment_tracker_data were created in prior migrations.
-- This migration only adds the new mission_team_members columns and
-- re-asserts grants/policies idempotently.

CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_number TEXT,
  question_name TEXT,
  question_text TEXT,
  section TEXT,
  subsection TEXT,
  page_limit INTEGER,
  requirements JSONB DEFAULT '[]',
  evaluation_criteria JSONB DEFAULT '[]',
  deliverables JSONB DEFAULT '[]',
  compliance_requirements JSONB DEFAULT '[]',
  architecture_version TEXT DEFAULT 'v1',
  status TEXT DEFAULT 'draft',
  admin_notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.question_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  writer_name TEXT,
  writer_email TEXT,
  athena_sme_name TEXT,
  client_sme_name TEXT,
  reviewer_name TEXT,
  copy_editor_name TEXT,
  workstream_lead TEXT,
  internal_deadline DATE,
  status TEXT DEFAULT 'unassigned',
  risk_level TEXT DEFAULT 'none',
  dependencies JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.question_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  win_themes JSONB DEFAULT '[]',
  source_doc_refs JSONB DEFAULT '[]',
  compliance_refs JSONB DEFAULT '[]',
  best_practices JSONB DEFAULT '[]',
  oracle_prompts JSONB DEFAULT '[]',
  iris_recommendations JSONB DEFAULT '[]',
  required_evidence JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.mission_team_members
  ADD COLUMN IF NOT EXISTS org TEXT,
  ADD COLUMN IF NOT EXISTS clearance TEXT DEFAULT 'None',
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS assignment_tracker_data JSONB DEFAULT '[]'::jsonb;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_assignments TO authenticated;
GRANT ALL ON public.question_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_intelligence TO authenticated;
GRANT ALL ON public.question_intelligence TO service_role;

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_intelligence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='questions' AND policyname='Full access questions') THEN
    CREATE POLICY "Full access questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='question_assignments' AND policyname='Full access question_assignments') THEN
    CREATE POLICY "Full access question_assignments" ON public.question_assignments FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='question_intelligence' AND policyname='Full access question_intelligence') THEN
    CREATE POLICY "Full access question_intelligence" ON public.question_intelligence FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;