-- Sprint 5: Win Strategy schema additions
ALTER TABLE public.mission_win_strategy
  ADD COLUMN IF NOT EXISTS mission_significance text,
  ADD COLUMN IF NOT EXISTS known_competitors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS evaluator_priorities text,
  ADD COLUMN IF NOT EXISTS evaluator_hot_buttons text,
  ADD COLUMN IF NOT EXISTS known_risks text,
  ADD COLUMN IF NOT EXISTS confirmed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS iris_drafted_at timestamptz;

-- Convert win_themes and proof_points to JSONB arrays of strings.
-- Safe conversion: null/empty -> '[]', existing text becomes single-element array.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mission_win_strategy'
      AND column_name='win_themes' AND data_type='text'
  ) THEN
    ALTER TABLE public.mission_win_strategy
      ALTER COLUMN win_themes DROP DEFAULT,
      ALTER COLUMN win_themes TYPE jsonb USING (
        CASE
          WHEN win_themes IS NULL OR btrim(win_themes) = '' THEN '[]'::jsonb
          ELSE to_jsonb(string_to_array(win_themes, E'\n'))
        END
      ),
      ALTER COLUMN win_themes SET DEFAULT '[]'::jsonb,
      ALTER COLUMN win_themes SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mission_win_strategy'
      AND column_name='proof_points' AND data_type='text'
  ) THEN
    ALTER TABLE public.mission_win_strategy
      ALTER COLUMN proof_points DROP DEFAULT,
      ALTER COLUMN proof_points TYPE jsonb USING (
        CASE
          WHEN proof_points IS NULL OR btrim(proof_points) = '' THEN '[]'::jsonb
          ELSE to_jsonb(string_to_array(proof_points, E'\n'))
        END
      ),
      ALTER COLUMN proof_points SET DEFAULT '[]'::jsonb,
      ALTER COLUMN proof_points SET NOT NULL;
  END IF;
END$$;