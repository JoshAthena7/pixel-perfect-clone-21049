
CREATE TABLE IF NOT EXISTS public.mission_momentum_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  score_date date NOT NULL DEFAULT CURRENT_DATE,
  composite_score integer,
  pace_score integer,
  oracle_score integer,
  activity_score integer,
  risk_score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, score_date)
);

GRANT SELECT, INSERT, UPDATE ON public.mission_momentum_daily TO authenticated;
GRANT ALL ON public.mission_momentum_daily TO service_role;

ALTER TABLE public.mission_momentum_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mission members can read momentum"
  ON public.mission_momentum_daily FOR SELECT
  USING (public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "Authenticated can insert momentum"
  ON public.mission_momentum_daily FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND public.is_mission_team_member(mission_id, auth.uid()));

CREATE POLICY "Authenticated can update momentum"
  ON public.mission_momentum_daily FOR UPDATE
  USING (public.is_mission_team_member(mission_id, auth.uid()))
  WITH CHECK (public.is_mission_team_member(mission_id, auth.uid()));

CREATE INDEX IF NOT EXISTS mission_momentum_daily_mission_date_idx
  ON public.mission_momentum_daily(mission_id, score_date DESC);


CREATE OR REPLACE FUNCTION public.calculate_mission_momentum(p_mission_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_questions integer := 0;
  v_finalized_questions integer := 0;
  v_days_total integer;
  v_days_elapsed integer;
  v_days_remaining integer;
  v_submission_date date;
  v_start_date date;
  v_oracle_approved integer := 0;
  v_activity_24h integer := 0;
  v_sos_unresolved integer := 0;
  v_pace_score integer := 50;
  v_oracle_score integer := 0;
  v_activity_score integer := 0;
  v_risk_score integer := 100;
  v_composite integer := 0;
  v_team_size integer := 0;
  v_required_rate numeric;
  v_actual_rate numeric;
BEGIN
  SELECT submission_deadline::date, created_at::date
    INTO v_submission_date, v_start_date
  FROM public.missions WHERE id = p_mission_id;

  IF v_submission_date IS NULL THEN
    v_submission_date := CURRENT_DATE + 30;
  END IF;
  IF v_start_date IS NULL THEN
    v_start_date := CURRENT_DATE;
  END IF;

  v_days_total     := GREATEST(1, v_submission_date - v_start_date);
  v_days_elapsed   := GREATEST(0, CURRENT_DATE - v_start_date);
  v_days_remaining := v_submission_date - CURRENT_DATE;

  SELECT COUNT(*) INTO v_total_questions
    FROM public.mission_questions WHERE mission_id = p_mission_id;

  SELECT COUNT(*) INTO v_finalized_questions
    FROM public.question_progress
    WHERE mission_id = p_mission_id AND status = 'finalized';

  SELECT COUNT(*) INTO v_oracle_approved
    FROM public.oracle_signals
    WHERE mission_id = p_mission_id
      AND status IN ('approved','pushed')
      AND tier = 'mission';

  SELECT COUNT(DISTINCT user_id) INTO v_activity_24h
    FROM public.mission_assist_events
    WHERE mission_id = p_mission_id
      AND created_at > now() - interval '24 hours';

  SELECT COUNT(*) INTO v_sos_unresolved
    FROM public.mission_assist_events mae
    WHERE mae.mission_id = p_mission_id
      AND mae.event_type = 'sos_raised'
      AND NOT EXISTS (
        SELECT 1 FROM public.mission_assist_events ack
        WHERE ack.mission_id = p_mission_id
          AND ack.event_type = 'sos_acknowledged'
          AND ack.metadata->>'question_id' = mae.metadata->>'question_id'
      );

  SELECT COUNT(*) INTO v_team_size
    FROM public.mission_team_members WHERE mission_id = p_mission_id;

  -- Pace
  IF v_days_elapsed = 0 OR v_total_questions = 0 THEN
    v_pace_score := 50;
  ELSE
    v_actual_rate   := v_finalized_questions::numeric / v_days_elapsed;
    v_required_rate := v_total_questions::numeric / v_days_total;
    IF v_required_rate = 0 THEN
      v_pace_score := 50;
    ELSE
      v_pace_score := LEAST(100, GREATEST(0, ROUND((v_actual_rate / v_required_rate) * 80)::integer));
    END IF;
  END IF;

  -- ORACLE
  v_oracle_score := LEAST(100, ROUND((v_oracle_approved::numeric / 20) * 100)::integer);

  -- Activity
  IF v_team_size = 0 THEN
    v_activity_score := 0;
  ELSE
    v_activity_score := LEAST(100, ROUND((v_activity_24h::numeric / LEAST(v_team_size, 10)) * 100)::integer);
  END IF;

  -- Risk
  v_risk_score := GREATEST(0, 100 - (v_sos_unresolved * 25));

  v_composite := ROUND(
    (v_pace_score * 0.35) +
    (v_oracle_score * 0.25) +
    (v_activity_score * 0.20) +
    (v_risk_score * 0.20)
  )::integer;

  RETURN jsonb_build_object(
    'composite', v_composite,
    'pace_score', v_pace_score,
    'oracle_score', v_oracle_score,
    'activity_score', v_activity_score,
    'risk_score', v_risk_score,
    'finalized', v_finalized_questions,
    'total_questions', v_total_questions,
    'days_remaining', v_days_remaining,
    'days_elapsed', v_days_elapsed,
    'active_today', v_activity_24h,
    'sos_unresolved', v_sos_unresolved,
    'oracle_approved', v_oracle_approved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_mission_momentum(uuid) TO authenticated;
