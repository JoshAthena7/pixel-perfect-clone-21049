CREATE TABLE IF NOT EXISTS public.oracle_sme_profiles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  title text,
  organization text,
  domain_tags text[],
  total_sessions integer DEFAULT 0,
  total_questions_answered integer DEFAULT 0,
  mission_types_supported text[],
  last_active_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

GRANT SELECT ON public.oracle_sme_profiles TO authenticated;
GRANT ALL ON public.oracle_sme_profiles TO service_role;

ALTER TABLE public.oracle_sme_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sme profiles"
  ON public.oracle_sme_profiles FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages sme profiles"
  ON public.oracle_sme_profiles FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.oracle_sme_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid REFERENCES public.missions(id) ON DELETE SET NULL,
  sme_id uuid REFERENCES public.oracle_sme_profiles(id),
  requesting_user_id uuid REFERENCES auth.users(id),
  topic text,
  question_summary text,
  answer_summary text,
  domain_tags text[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oracle_sme_sessions_sme_id_idx ON public.oracle_sme_sessions(sme_id);
CREATE INDEX IF NOT EXISTS oracle_sme_sessions_mission_id_idx ON public.oracle_sme_sessions(mission_id);

GRANT SELECT ON public.oracle_sme_sessions TO authenticated;
GRANT ALL ON public.oracle_sme_sessions TO service_role;

ALTER TABLE public.oracle_sme_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sme sessions"
  ON public.oracle_sme_sessions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Service role manages sme sessions"
  ON public.oracle_sme_sessions FOR ALL
  TO service_role USING (true) WITH CHECK (true);
