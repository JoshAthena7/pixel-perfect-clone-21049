
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  question_number TEXT,
  question_name TEXT,
  question_text TEXT,
  section TEXT,
  subsection TEXT,
  page_limit INTEGER,
  requirements JSONB DEFAULT '[]'::jsonb,
  evaluation_criteria JSONB DEFAULT '[]'::jsonb,
  deliverables JSONB DEFAULT '[]'::jsonb,
  compliance_requirements JSONB DEFAULT '[]'::jsonb,
  architecture_version TEXT DEFAULT 'v1',
  status TEXT DEFAULT 'draft',
  admin_notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='questions' AND policyname='Full access questions') THEN
    CREATE POLICY "Full access questions" ON public.questions FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

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
  dependencies JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_assignments TO authenticated;
GRANT ALL ON public.question_assignments TO service_role;
ALTER TABLE public.question_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='question_assignments' AND policyname='Full access question_assignments') THEN
    CREATE POLICY "Full access question_assignments" ON public.question_assignments FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.question_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  win_themes JSONB DEFAULT '[]'::jsonb,
  source_doc_refs JSONB DEFAULT '[]'::jsonb,
  compliance_refs JSONB DEFAULT '[]'::jsonb,
  best_practices JSONB DEFAULT '[]'::jsonb,
  oracle_prompts JSONB DEFAULT '[]'::jsonb,
  iris_recommendations JSONB DEFAULT '[]'::jsonb,
  required_evidence JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_intelligence TO authenticated;
GRANT ALL ON public.question_intelligence TO service_role;
ALTER TABLE public.question_intelligence ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='question_intelligence' AND policyname='Full access question_intelligence') THEN
    CREATE POLICY "Full access question_intelligence" ON public.question_intelligence FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
