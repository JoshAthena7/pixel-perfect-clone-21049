
CREATE TABLE public.section_drafts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engagement_id uuid NOT NULL REFERENCES public.engagements(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.heatmap_sections(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  word_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','returned')),
  version integer NOT NULL DEFAULT 1,
  return_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX section_drafts_engagement_idx ON public.section_drafts(engagement_id);
CREATE INDEX section_drafts_section_idx ON public.section_drafts(section_id);
CREATE INDEX section_drafts_author_idx ON public.section_drafts(author_id);
CREATE INDEX section_drafts_status_idx ON public.section_drafts(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_drafts TO authenticated;
GRANT ALL ON public.section_drafts TO service_role;

ALTER TABLE public.section_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "section_drafts_select_author_or_leadership"
ON public.section_drafts FOR SELECT TO authenticated
USING (
  author_id = auth.uid()
  OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
);

CREATE POLICY "section_drafts_insert_author"
ON public.section_drafts FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND private.is_engagement_member(engagement_id)
);

CREATE POLICY "section_drafts_update_author_or_leadership"
ON public.section_drafts FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  OR private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead'])
);

CREATE POLICY "section_drafts_delete_leadership"
ON public.section_drafts FOR DELETE TO authenticated
USING (private.has_engagement_role(engagement_id, ARRAY['founder','pm','engagement_lead']));

CREATE TRIGGER section_drafts_updated_at
BEFORE UPDATE ON public.section_drafts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
