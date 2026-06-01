
CREATE TABLE IF NOT EXISTS public.market_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  type text NOT NULL DEFAULT 'news',
  title text NOT NULL,
  url text,
  summary text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_intelligence TO authenticated;
GRANT ALL ON public.market_intelligence TO service_role;
ALTER TABLE public.market_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY mi_select_auth ON public.market_intelligence
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.briefing_book_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  section_key text NOT NULL,
  content text,
  status text NOT NULL DEFAULT 'pending',
  generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, section_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.briefing_book_sections TO authenticated;
GRANT ALL ON public.briefing_book_sections TO service_role;
ALTER TABLE public.briefing_book_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY bbs_select ON public.briefing_book_sections
  FOR SELECT TO authenticated USING (is_mission_member(mission_id, auth.uid()));
CREATE POLICY bbs_write_members ON public.briefing_book_sections
  FOR ALL TO authenticated
  USING (is_mission_member(mission_id, auth.uid()))
  WITH CHECK (is_mission_member(mission_id, auth.uid()));
