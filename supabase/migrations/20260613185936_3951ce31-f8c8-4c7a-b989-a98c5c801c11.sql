
-- Extend mission_outcomes with the fields required by the Close-Mission workflow.
-- The table already has PK on mission_id (which provides UNIQUE), so we keep that.

ALTER TABLE public.mission_outcomes DROP CONSTRAINT IF EXISTS mission_outcomes_outcome_check;

ALTER TABLE public.mission_outcomes
  ADD COLUMN IF NOT EXISTS award_value numeric,
  ADD COLUMN IF NOT EXISTS award_date date,
  ADD COLUMN IF NOT EXISTS incumbent_retained boolean,
  ADD COLUMN IF NOT EXISTS final_score_received numeric,
  ADD COLUMN IF NOT EXISTS final_rank integer,
  ADD COLUMN IF NOT EXISTS total_offerors integer,
  ADD COLUMN IF NOT EXISTS debrief_received boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS debrief_notes text,
  ADD COLUMN IF NOT EXISTS orals_held boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS orals_notes text,
  ADD COLUMN IF NOT EXISTS bafo_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bafo_notes text,
  ADD COLUMN IF NOT EXISTS awarded_to text,
  ADD COLUMN IF NOT EXISTS transition_start_date date,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT now();

-- Normalise legacy outcome values so the new CHECK passes.
UPDATE public.mission_outcomes SET outcome = 'win' WHERE outcome = 'won';
UPDATE public.mission_outcomes SET outcome = 'loss' WHERE outcome = 'lost';
UPDATE public.mission_outcomes SET outcome = 'cancelled' WHERE outcome = 'withdrawn';
UPDATE public.mission_outcomes SET outcome = 'no_award' WHERE outcome = 'no_decision';

ALTER TABLE public.mission_outcomes
  ADD CONSTRAINT mission_outcomes_outcome_check
  CHECK (outcome IN ('win','loss','no_award','cancelled','protest_pending','protest_sustained','protest_denied'));

CREATE INDEX IF NOT EXISTS mission_outcomes_outcome_idx ON public.mission_outcomes (outcome);
CREATE INDEX IF NOT EXISTS mission_outcomes_mission_id_idx ON public.mission_outcomes (mission_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_outcomes TO authenticated;
GRANT ALL ON public.mission_outcomes TO service_role;
