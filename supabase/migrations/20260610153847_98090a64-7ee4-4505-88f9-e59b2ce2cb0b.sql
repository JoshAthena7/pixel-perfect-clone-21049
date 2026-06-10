
-- Sprint 11: extend tables for new tabs

-- submission checklist needs owner / due_date / status
ALTER TABLE public.mission_submission_checklist
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS due_date timestamptz,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'not_started';

-- style guide: structured fields
ALTER TABLE public.mission_style_guide
  ADD COLUMN IF NOT EXISTS voice_and_tone text,
  ADD COLUMN IF NOT EXISTS formatting_requirements text,
  ADD COLUMN IF NOT EXISTS terminology_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS words_to_avoid jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS length_and_density text,
  ADD COLUMN IF NOT EXISTS political_sensitivities text,
  ADD COLUMN IF NOT EXISTS competitive_sensitivities text,
  ADD COLUMN IF NOT EXISTS historical_sensitivities text,
  ADD COLUMN IF NOT EXISTS cultural_sensitivities text;

-- journey phase gate clearing
ALTER TABLE public.mission_journey_phases
  ADD COLUMN IF NOT EXISTS is_cleared boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleared_by uuid,
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz;
