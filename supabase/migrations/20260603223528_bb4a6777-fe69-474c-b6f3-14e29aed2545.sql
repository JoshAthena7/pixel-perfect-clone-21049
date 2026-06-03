
-- Enable pgvector for expertise embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- profiles: add expertise / availability / wins / bio / embedding
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expertise_areas       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS states_experience     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS programs_experience   text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS question_types        text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notable_wins          jsonb  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS availability_status   text   NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS availability_until    date,
  ADD COLUMN IF NOT EXISTS availability_note     text,
  ADD COLUMN IF NOT EXISTS expert_bio            text,
  ADD COLUMN IF NOT EXISTS expertise_embedding   vector(1536),
  ADD COLUMN IF NOT EXISTS profile_completed     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_updated_at    timestamptz;

-- Constrain availability_status to the four allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_availability_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_availability_status_check
      CHECK (availability_status IN ('available','pens_down','unavailable','pto'));
  END IF;
END$$;

-- Bio length cap (140 chars, per spec)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_expert_bio_length_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_expert_bio_length_check
      CHECK (expert_bio IS NULL OR char_length(expert_bio) <= 140);
  END IF;
END$$;

-- ============================================================
-- expertise_options: reference data for editor dropdowns
-- ============================================================
CREATE TABLE IF NOT EXISTS public.expertise_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('expertise_area','question_type')),
  label       text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, label)
);

GRANT SELECT ON public.expertise_options TO authenticated;
GRANT ALL    ON public.expertise_options TO service_role;

ALTER TABLE public.expertise_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read expertise options"
  ON public.expertise_options FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform admins manage expertise options"
  ON public.expertise_options FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_platform_admin = true));

-- ============================================================
-- Seed expertise_options
-- ============================================================
INSERT INTO public.expertise_options (kind, label, sort_order) VALUES
  ('expertise_area', 'Health Equity', 10),
  ('expertise_area', 'CHW Integration', 20),
  ('expertise_area', 'SDOH Screening', 30),
  ('expertise_area', 'Behavioral Health', 40),
  ('expertise_area', 'Substance Use Disorder', 50),
  ('expertise_area', 'LTSS — HCBS', 60),
  ('expertise_area', 'LTSS — Nursing Facility', 70),
  ('expertise_area', 'Wraparound', 80),
  ('expertise_area', 'Family-Driven Care', 90),
  ('expertise_area', 'Youth-Guided Care', 100),
  ('expertise_area', 'Transition-Age Youth', 110),
  ('expertise_area', 'I/DD Services', 120),
  ('expertise_area', 'Autism Services', 130),
  ('expertise_area', 'Crisis Services', 140),
  ('expertise_area', 'Network Adequacy', 150),
  ('expertise_area', 'Provider Relations', 160),
  ('expertise_area', 'Quality Measures / HEDIS', 170),
  ('expertise_area', 'Outcomes Reporting', 180),
  ('expertise_area', 'Care Management', 190),
  ('expertise_area', 'Member Experience', 200),
  ('expertise_area', 'Dual Eligibles', 210),
  ('expertise_area', 'Pharmacy Benefits', 220),
  ('expertise_area', 'Value-Based Contracting', 230),
  ('expertise_area', 'Data & Technology', 240),
  ('expertise_area', 'Compliance & Regulatory', 250),
  ('expertise_area', 'Competitive Intelligence', 260),
  ('expertise_area', 'Proposal Strategy', 270),
  ('expertise_area', 'Executive Writing', 280),
  ('question_type', 'Health Equity', 10),
  ('question_type', 'Network Adequacy', 20),
  ('question_type', 'Care Management', 30),
  ('question_type', 'Quality Improvement', 40),
  ('question_type', 'Member Experience', 50),
  ('question_type', 'Behavioral Health Integration', 60),
  ('question_type', 'LTSS Services', 70),
  ('question_type', 'Provider Network', 80),
  ('question_type', 'Data & Reporting', 90),
  ('question_type', 'Corporate Capability', 100),
  ('question_type', 'Staffing & Workforce', 110),
  ('question_type', 'Financial', 120),
  ('question_type', 'Transition Planning', 130),
  ('question_type', 'Community Partnerships', 140),
  ('question_type', 'Innovation', 150)
ON CONFLICT (kind, label) DO NOTHING;

-- ============================================================
-- Auto-sync writer availability with mission pens-down dates
--   Call from a cron job or on mission updates.
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_pens_down_availability()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Flip writers into pens_down for missions with an upcoming/active pens-down window
  UPDATE public.profiles p
     SET availability_status = 'pens_down',
         availability_until  = m.pens_down_date,
         profile_updated_at  = now()
    FROM public.mission_members mm
    JOIN public.missions m ON m.id = mm.mission_id
   WHERE mm.user_id = p.id
     AND mm.role = 'writer'
     AND m.pens_down_date IS NOT NULL
     AND m.pens_down_date >= CURRENT_DATE
     AND p.availability_status IN ('available')
     AND (p.availability_until IS NULL OR p.availability_until <> m.pens_down_date);

  -- Reset pens_down back to available once the date has passed
  UPDATE public.profiles p
     SET availability_status = 'available',
         availability_until  = NULL,
         profile_updated_at  = now()
   WHERE p.availability_status = 'pens_down'
     AND p.availability_until IS NOT NULL
     AND p.availability_until < CURRENT_DATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_pens_down_availability() TO authenticated, service_role;
