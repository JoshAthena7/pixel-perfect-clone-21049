
-- 1. rfp_questions table
CREATE TABLE public.rfp_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.heatmap_sections(id) ON DELETE SET NULL,
  question_number TEXT,
  title TEXT,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rfp_questions_engagement_idx ON public.rfp_questions(engagement_id);
CREATE INDEX rfp_questions_section_idx ON public.rfp_questions(section_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rfp_questions TO authenticated;
GRANT ALL ON public.rfp_questions TO service_role;

ALTER TABLE public.rfp_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rfp_questions_select_member" ON public.rfp_questions
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "rfp_questions_insert_leadership" ON public.rfp_questions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "rfp_questions_update_leadership" ON public.rfp_questions
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "rfp_questions_delete_leadership" ON public.rfp_questions
  FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER rfp_questions_updated_at
  BEFORE UPDATE ON public.rfp_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. win_theme_mappings table
CREATE TABLE public.win_theme_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id UUID NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  win_theme_id UUID NOT NULL REFERENCES public.win_themes(id) ON DELETE CASCADE,
  section_id UUID REFERENCES public.heatmap_sections(id) ON DELETE CASCADE,
  question_id UUID REFERENCES public.rfp_questions(id) ON DELETE CASCADE,
  writer_hint TEXT,
  ai_suggested BOOLEAN NOT NULL DEFAULT false,
  ai_similarity REAL,
  confirmed BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT win_theme_mappings_target_chk CHECK (section_id IS NOT NULL OR question_id IS NOT NULL)
);

-- Unique deduplication; NULLs are distinct in PG so we use a unique index with COALESCE
CREATE UNIQUE INDEX win_theme_mappings_unique_idx
  ON public.win_theme_mappings (
    win_theme_id,
    COALESCE(section_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(question_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX win_theme_mappings_engagement_idx ON public.win_theme_mappings(engagement_id);
CREATE INDEX win_theme_mappings_theme_idx ON public.win_theme_mappings(win_theme_id);
CREATE INDEX win_theme_mappings_section_idx ON public.win_theme_mappings(section_id);
CREATE INDEX win_theme_mappings_question_idx ON public.win_theme_mappings(question_id);
CREATE INDEX win_theme_mappings_review_idx
  ON public.win_theme_mappings(engagement_id)
  WHERE ai_suggested = true AND confirmed = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.win_theme_mappings TO authenticated;
GRANT ALL ON public.win_theme_mappings TO service_role;

ALTER TABLE public.win_theme_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wtm_select_member" ON public.win_theme_mappings
  FOR SELECT TO authenticated
  USING (private.is_engagement_member(engagement_id));

CREATE POLICY "wtm_insert_leadership" ON public.win_theme_mappings
  FOR INSERT TO authenticated
  WITH CHECK (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "wtm_update_leadership" ON public.win_theme_mappings
  FOR UPDATE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE POLICY "wtm_delete_leadership" ON public.win_theme_mappings
  FOR DELETE TO authenticated
  USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER win_theme_mappings_updated_at
  BEFORE UPDATE ON public.win_theme_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Backfill existing win_themes.section_ids into win_theme_mappings, then drop the column
INSERT INTO public.win_theme_mappings (engagement_id, win_theme_id, section_id, confirmed, ai_suggested)
SELECT t.engagement_id, t.id, sid, true, false
FROM public.win_themes t
CROSS JOIN LATERAL unnest(t.section_ids) AS sid
WHERE sid IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.win_themes DROP COLUMN section_ids;
