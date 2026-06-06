
-- Enum for template element types
DO $$ BEGIN
  CREATE TYPE public.response_template_element_type AS ENUM ('header','subsection','field','table','word_limit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.response_template_status AS ENUM ('active','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.response_template_source AS ENUM ('upload','manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) Templates
CREATE TABLE IF NOT EXISTS public.mission_response_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id UUID NOT NULL UNIQUE REFERENCES public.missions(id) ON DELETE CASCADE,
  status public.response_template_status NOT NULL DEFAULT 'active',
  source public.response_template_source,
  source_file_path TEXT,
  source_file_name TEXT,
  iris_confidence TEXT,
  iris_source_citation TEXT,
  version INT NOT NULL DEFAULT 1,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_response_templates TO authenticated;
GRANT ALL ON public.mission_response_templates TO service_role;
ALTER TABLE public.mission_response_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view templates"
  ON public.mission_response_templates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_response_templates.mission_id AND mm.user_id = auth.uid()));

CREATE POLICY "Mission PMs can manage templates"
  ON public.mission_response_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_response_templates.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('pm','lead','owner','engagement_lead')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.mission_members mm WHERE mm.mission_id = mission_response_templates.mission_id AND mm.user_id = auth.uid() AND mm.role IN ('pm','lead','owner','engagement_lead')));

-- 2) Elements
CREATE TABLE IF NOT EXISTS public.mission_response_template_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.mission_response_templates(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.mission_response_template_elements(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  element_type public.response_template_element_type NOT NULL,
  label TEXT NOT NULL,
  word_limit INT,
  table_columns JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mrte_template ON public.mission_response_template_elements(template_id, order_index);
CREATE INDEX IF NOT EXISTS idx_mrte_parent ON public.mission_response_template_elements(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_response_template_elements TO authenticated;
GRANT ALL ON public.mission_response_template_elements TO service_role;
ALTER TABLE public.mission_response_template_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view template elements"
  ON public.mission_response_template_elements FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_response_templates t
    JOIN public.mission_members mm ON mm.mission_id = t.mission_id
    WHERE t.id = mission_response_template_elements.template_id AND mm.user_id = auth.uid()
  ));

CREATE POLICY "Mission PMs can manage template elements"
  ON public.mission_response_template_elements FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_response_templates t
    JOIN public.mission_members mm ON mm.mission_id = t.mission_id
    WHERE t.id = mission_response_template_elements.template_id
      AND mm.user_id = auth.uid()
      AND mm.role IN ('pm','lead','owner','engagement_lead')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mission_response_templates t
    JOIN public.mission_members mm ON mm.mission_id = t.mission_id
    WHERE t.id = mission_response_template_elements.template_id
      AND mm.user_id = auth.uid()
      AND mm.role IN ('pm','lead','owner','engagement_lead')
  ));

-- 3) Versions (snapshot for diff)
CREATE TABLE IF NOT EXISTS public.mission_response_template_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES public.mission_response_templates(id) ON DELETE CASCADE,
  version INT NOT NULL,
  snapshot JSONB NOT NULL,
  saved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

GRANT SELECT, INSERT ON public.mission_response_template_versions TO authenticated;
GRANT ALL ON public.mission_response_template_versions TO service_role;
ALTER TABLE public.mission_response_template_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view template versions"
  ON public.mission_response_template_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_response_templates t
    JOIN public.mission_members mm ON mm.mission_id = t.mission_id
    WHERE t.id = mission_response_template_versions.template_id AND mm.user_id = auth.uid()
  ));

CREATE POLICY "Mission PMs can insert template versions"
  ON public.mission_response_template_versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mission_response_templates t
    JOIN public.mission_members mm ON mm.mission_id = t.mission_id
    WHERE t.id = mission_response_template_versions.template_id
      AND mm.user_id = auth.uid()
      AND mm.role IN ('pm','lead','owner','engagement_lead')
  ));

-- 4) Per-section progress
CREATE TABLE IF NOT EXISTS public.mission_section_template_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id UUID NOT NULL REFERENCES public.mission_sections(id) ON DELETE CASCADE,
  element_id UUID NOT NULL REFERENCES public.mission_response_template_elements(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  word_count INT NOT NULL DEFAULT 0,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_id, element_id)
);

CREATE INDEX IF NOT EXISTS idx_mstp_section ON public.mission_section_template_progress(section_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_section_template_progress TO authenticated;
GRANT ALL ON public.mission_section_template_progress TO service_role;
ALTER TABLE public.mission_section_template_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can view section template progress"
  ON public.mission_section_template_progress FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_sections s
    JOIN public.mission_members mm ON mm.mission_id = s.mission_id
    WHERE s.id = mission_section_template_progress.section_id AND mm.user_id = auth.uid()
  ));

CREATE POLICY "Mission members can write section template progress"
  ON public.mission_section_template_progress FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.mission_sections s
    JOIN public.mission_members mm ON mm.mission_id = s.mission_id
    WHERE s.id = mission_section_template_progress.section_id AND mm.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mission_sections s
    JOIN public.mission_members mm ON mm.mission_id = s.mission_id
    WHERE s.id = mission_section_template_progress.section_id AND mm.user_id = auth.uid()
  ));

-- updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_mrt_updated_at ON public.mission_response_templates;
CREATE TRIGGER trg_mrt_updated_at BEFORE UPDATE ON public.mission_response_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mrte_updated_at ON public.mission_response_template_elements;
CREATE TRIGGER trg_mrte_updated_at BEFORE UPDATE ON public.mission_response_template_elements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_mstp_updated_at ON public.mission_section_template_progress;
CREATE TRIGGER trg_mstp_updated_at BEFORE UPDATE ON public.mission_section_template_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
