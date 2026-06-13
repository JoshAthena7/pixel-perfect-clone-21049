
-- Shared updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================================================================
-- 1. ALTER existing public.signals — add missing ATLAS columns only
-- =========================================================================
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS classified_as text,
  ADD COLUMN IF NOT EXISTS reviewed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS tags text[];
-- signal_type and confidence already exist on public.signals; skipped.

-- =========================================================================
-- 2. ALTER existing public.mission_decisions
-- =========================================================================
ALTER TABLE public.mission_decisions
  ADD COLUMN IF NOT EXISTS applies_to_states text[],
  ADD COLUMN IF NOT EXISTS applies_to_programs text[],
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

-- =========================================================================
-- 3. ALTER existing public.missions — canvas columns
-- =========================================================================
ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS north_star text,
  ADD COLUMN IF NOT EXISTS known_competitors text[],
  ADD COLUMN IF NOT EXISTS why_win text,
  ADD COLUMN IF NOT EXISTS why_lose text,
  ADD COLUMN IF NOT EXISTS state_priorities text,
  ADD COLUMN IF NOT EXISTS win_themes_text text,
  ADD COLUMN IF NOT EXISTS reinforce text[],
  ADD COLUMN IF NOT EXISTS avoid text[],
  ADD COLUMN IF NOT EXISTS biggest_concerns text;

-- =========================================================================
-- 4. public.state_dna
-- =========================================================================
CREATE TABLE public.state_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state text NOT NULL,
  category text NOT NULL CHECK (category IN ('procurement','political','stakeholder','regulatory','historical','cultural')),
  attribute text NOT NULL,
  value text NOT NULL,
  source text,
  confidence text DEFAULT 'med' CHECK (confidence IN ('high','med','low')),
  last_reviewed date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_dna TO authenticated;
GRANT ALL ON public.state_dna TO service_role;
ALTER TABLE public.state_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read state_dna" ON public.state_dna
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write state_dna" ON public.state_dna
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_state_dna_updated_at
  BEFORE UPDATE ON public.state_dna
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 5. public.program_dna
-- =========================================================================
CREATE TABLE public.program_dna (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program text NOT NULL,
  category text NOT NULL CHECK (category IN ('procurement','political','stakeholder','regulatory','historical','cultural')),
  attribute text NOT NULL,
  value text NOT NULL,
  source text,
  confidence text DEFAULT 'med' CHECK (confidence IN ('high','med','low')),
  last_reviewed date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_dna TO authenticated;
GRANT ALL ON public.program_dna TO service_role;
ALTER TABLE public.program_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read program_dna" ON public.program_dna
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write program_dna" ON public.program_dna
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_program_dna_updated_at
  BEFORE UPDATE ON public.program_dna
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 6. public.insights
-- =========================================================================
CREATE TABLE public.insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE,
  content text NOT NULL,
  insight_type text,
  source text,
  confidence text DEFAULT 'med' CHECK (confidence IN ('high','med','low')),
  expiry_flag boolean DEFAULT false,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insights TO authenticated;
GRANT ALL ON public.insights TO service_role;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read insights" ON public.insights
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write insights" ON public.insights
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_insights_updated_at
  BEFORE UPDATE ON public.insights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 7. public.experts
-- =========================================================================
CREATE TABLE public.experts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role text,
  expertise_areas text[],
  states text[],
  programs text[],
  contact_method text,
  notes text,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experts TO authenticated;
GRANT ALL ON public.experts TO service_role;
ALTER TABLE public.experts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read experts" ON public.experts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can write experts" ON public.experts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER update_experts_updated_at
  BEFORE UPDATE ON public.experts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
