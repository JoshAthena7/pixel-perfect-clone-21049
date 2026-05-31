-- ================================================================
-- QUESTION HEALTH ARCHITECTURE
-- Question Health → Section Health → Mission Health (derived)
-- ================================================================

-- 1. Extend rfp_questions with operational fields
ALTER TABLE rfp_questions
  ADD COLUMN IF NOT EXISTS health           TEXT    DEFAULT 'Green'
    CHECK (health IN ('Green','Yellow','Red','Critical')),
  ADD COLUMN IF NOT EXISTS health_score     NUMERIC(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS status           TEXT    DEFAULT 'Not Started'
    CHECK (status IN ('Not Started','In Progress','Draft Complete','In Review','Final','At Risk','Critical')),
  ADD COLUMN IF NOT EXISTS assigned_writer  TEXT,
  ADD COLUMN IF NOT EXISTS supporting_writer TEXT,
  ADD COLUMN IF NOT EXISTS assigned_sme     TEXT,
  ADD COLUMN IF NOT EXISTS reviewer         TEXT,
  ADD COLUMN IF NOT EXISTS owner            TEXT,
  ADD COLUMN IF NOT EXISTS due_date         DATE,
  ADD COLUMN IF NOT EXISTS word_limit       INTEGER,
  ADD COLUMN IF NOT EXISTS requires_graphic BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_leadership_review BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS writer_confidence INTEGER CHECK (writer_confidence BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS sme_confirmed    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS compliance_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_issues      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS latest_review_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS updated_by_name  TEXT;

-- 2. Question Confidence Checks (leadership quality assessments)
CREATE TABLE IF NOT EXISTS question_confidence_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES rfp_questions(id) ON DELETE CASCADE,
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  reviewer        TEXT NOT NULL,
  user_id         UUID REFERENCES auth.users(id),
  health_status   TEXT NOT NULL CHECK (health_status IN ('Green','Yellow','Red','Critical')),
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 1 AND 5),
  observations    TEXT,
  concerns        TEXT,
  risks           TEXT,
  recommendations TEXT,
  follow_up_actions TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE question_confidence_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read checks"   ON question_confidence_checks FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = question_confidence_checks.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM insert checks" ON question_confidence_checks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = question_confidence_checks.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- 3. Red Team / Gold Team Reviews
CREATE TABLE IF NOT EXISTS question_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES rfp_questions(id) ON DELETE CASCADE,
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  review_type     TEXT NOT NULL CHECK (review_type IN ('red_team','gold_team')),
  reviewer_name   TEXT NOT NULL,
  user_id         UUID REFERENCES auth.users(id),
  score           NUMERIC(5,2),
  max_score       NUMERIC(5,2) DEFAULT 100,
  notes           TEXT,
  risks           TEXT,
  recommendations TEXT,
  review_date     DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE question_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read reviews"   ON question_reviews FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = question_reviews.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM insert reviews" ON question_reviews FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = question_reviews.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- 4. Question Timeline (quality journey log)
CREATE TABLE IF NOT EXISTS question_timeline (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id     UUID NOT NULL REFERENCES rfp_questions(id) ON DELETE CASCADE,
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  description     TEXT NOT NULL,
  actor           TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE question_timeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read timeline" ON question_timeline FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = question_timeline.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Members insert timeline" ON question_timeline FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = question_timeline.engagement_id AND user_id = auth.uid()));

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rfp_questions_health ON rfp_questions(engagement_id, health);
CREATE INDEX IF NOT EXISTS idx_qcc_question ON question_confidence_checks(question_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_question ON question_reviews(question_id, review_type);
CREATE INDEX IF NOT EXISTS idx_qt_question ON question_timeline(question_id, created_at DESC);

-- 6. Function: calculate question health score (called after any update)
CREATE OR REPLACE FUNCTION calculate_question_health(q_id UUID)
RETURNS TEXT AS $$
DECLARE
  q RECORD;
  latest_check RECORD;
  latest_review RECORD;
  open_issue_count INTEGER;
  score NUMERIC := 100;
  health TEXT := 'Green';
BEGIN
  SELECT * INTO q FROM rfp_questions WHERE id = q_id;
  IF NOT FOUND THEN RETURN 'Green'; END IF;

  -- Penalty: no writer assigned (-20)
  IF q.assigned_writer IS NULL THEN score := score - 20; END IF;

  -- Penalty: no SME assigned when required (-15)
  IF q.assigned_sme IS NULL THEN score := score - 10; END IF;

  -- Writer confidence factor
  IF q.writer_confidence IS NOT NULL THEN
    -- Confidence 1-2: heavy penalty
    IF q.writer_confidence <= 2 THEN score := score - 25;
    ELSIF q.writer_confidence = 3 THEN score := score - 10;
    END IF;
  ELSE
    score := score - 15; -- No confidence submitted
  END IF;

  -- SME not confirmed (-10)
  IF NOT q.sme_confirmed THEN score := score - 10; END IF;

  -- Open issues
  IF q.open_issues > 0 THEN score := score - (q.open_issues * 8); END IF;

  -- Latest confidence check from leadership
  SELECT * INTO latest_check FROM question_confidence_checks
    WHERE question_id = q_id ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF latest_check.health_status = 'Critical' THEN score := score - 40;
    ELSIF latest_check.health_status = 'Red' THEN score := score - 25;
    ELSIF latest_check.health_status = 'Yellow' THEN score := score - 10;
    END IF;
    -- Confidence score 1-2 from leadership: additional penalty
    IF latest_check.confidence_score <= 2 THEN score := score - 15; END IF;
  END IF;

  -- Latest review score
  SELECT * INTO latest_review FROM question_reviews
    WHERE question_id = q_id ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND latest_review.max_score > 0 THEN
    DECLARE pct NUMERIC := (latest_review.score / latest_review.max_score) * 100;
    BEGIN
      IF pct < 60 THEN score := score - 30;
      ELSIF pct < 75 THEN score := score - 15;
      END IF;
    END;
  END IF;

  -- Floor at 0
  IF score < 0 THEN score := 0; END IF;

  -- Map score to health
  IF score >= 80 THEN health := 'Green';
  ELSIF score >= 60 THEN health := 'Yellow';
  ELSIF score >= 40 THEN health := 'Red';
  ELSE health := 'Critical';
  END IF;

  -- Update the question
  UPDATE rfp_questions
    SET health = health, health_score = score, updated_at = now()
    WHERE id = q_id;

  RETURN health;
END;
$$ LANGUAGE plpgsql;

-- 7. Function: calculate section health from questions
CREATE OR REPLACE FUNCTION calculate_section_health(s_id UUID, e_id UUID)
RETURNS TEXT AS $$
DECLARE
  total_weight NUMERIC := 0;
  weighted_score NUMERIC := 0;
  q RECORD;
  score NUMERIC;
  health TEXT;
BEGIN
  FOR q IN
    SELECT id, evaluation_weight_pct, health_score
    FROM rfp_questions
    WHERE section_id = s_id AND engagement_id = e_id
  LOOP
    DECLARE w NUMERIC := COALESCE(q.evaluation_weight_pct, 1);
    BEGIN
      total_weight := total_weight + w;
      weighted_score := weighted_score + (COALESCE(q.health_score, 100) * w);
    END;
  END LOOP;

  IF total_weight = 0 THEN RETURN 'Green'; END IF;
  score := weighted_score / total_weight;

  IF score >= 80 THEN health := 'Green';
  ELSIF score >= 60 THEN health := 'Yellow';
  ELSIF score >= 40 THEN health := 'Red';
  ELSE health := 'Critical';
  END IF;

  -- Update section health map
  UPDATE heatmap_sections
    SET status = health, updated_at = now()
    WHERE id = s_id AND engagement_id = e_id;

  RETURN health;
END;
$$ LANGUAGE plpgsql;

-- 8. Function: calculate mission health from sections (replaces manual huddle-driven health)
CREATE OR REPLACE FUNCTION calculate_mission_health(e_id UUID)
RETURNS TEXT AS $$
DECLARE
  total_weight NUMERIC := 0;
  weighted_score NUMERIC := 0;
  s RECORD;
  q_avg NUMERIC;
  mission_health TEXT;
  score NUMERIC;
BEGIN
  FOR s IN
    SELECT id, evaluation_weight_pct FROM heatmap_sections WHERE engagement_id = e_id
  LOOP
    SELECT AVG(health_score) INTO q_avg
      FROM rfp_questions
      WHERE section_id = s.id AND engagement_id = e_id;

    DECLARE w NUMERIC := COALESCE(s.evaluation_weight_pct, 1);
    BEGIN
      total_weight := total_weight + w;
      weighted_score := weighted_score + (COALESCE(q_avg, 100) * w);
    END;
  END LOOP;

  IF total_weight = 0 THEN
    -- No questions yet — keep existing health
    SELECT health INTO mission_health FROM engagements WHERE id = e_id;
    RETURN COALESCE(mission_health, 'Green');
  END IF;

  score := weighted_score / total_weight;

  IF score >= 80 THEN mission_health := 'Green';
  ELSIF score >= 60 THEN mission_health := 'Yellow';
  ELSIF score >= 40 THEN mission_health := 'Red';
  ELSE mission_health := 'Critical';
  END IF;

  UPDATE engagements SET health = mission_health WHERE id = e_id;
  RETURN mission_health;
END;
$$ LANGUAGE plpgsql;
