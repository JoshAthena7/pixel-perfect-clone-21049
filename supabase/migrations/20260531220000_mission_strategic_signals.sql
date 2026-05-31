-- Mission Strategic Signals
-- Stores IRIS-classified strategic intelligence items per mission.
-- Every row is traceable back to its source (market_intelligence or engagement_research).

CREATE TABLE IF NOT EXISTS mission_strategic_signals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,

  -- Source traceability (required)
  source_table        TEXT NOT NULL,   -- 'market_intelligence' | 'engagement_research' | 'state_market_data'
  source_id           UUID,            -- FK to the originating row
  source_name         TEXT NOT NULL,   -- Human-readable source: "Federal Register", "Congress.gov", etc.
  source_url          TEXT,            -- Direct link to original document
  published_at        TIMESTAMPTZ,     -- When the source was published
  detected_at         TIMESTAMPTZ DEFAULT now(),  -- When IRIS first saw this
  last_updated_at     TIMESTAMPTZ DEFAULT now(),

  -- Content
  title               TEXT NOT NULL,
  summary             TEXT,

  -- IRIS Classification
  classification      TEXT NOT NULL
    CHECK (classification IN ('no_action','monitor','signal','insight','recommendation','alert','escalation')),
  iris_interpretation TEXT,            -- Why IRIS flagged this
  recommended_action  TEXT,            -- What leadership or team should do
  why_it_matters      TEXT,            -- Plain-language explanation for executives

  -- Scoring
  match_score         NUMERIC(4,3),    -- Semantic similarity to engagement (0-1)
  urgency_score       NUMERIC(4,3),    -- Time sensitivity (0-1)
  confidence_score    NUMERIC(4,3),    -- IRIS confidence in classification (0-1)
  strategic_relevance NUMERIC(4,3),    -- How much this affects the proposal (0-1)

  -- Context tags
  affected_states     TEXT[],
  affected_categories TEXT[],
  affected_competitor TEXT,
  affected_agency     TEXT,
  affected_workstream TEXT,

  -- Lifecycle
  status              TEXT DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  owner               TEXT,
  acknowledged_at     TIMESTAMPTZ,
  resolved_at         TIMESTAMPTZ,

  -- Prevent duplicate classification of same source item
  UNIQUE(engagement_id, source_table, source_id)
);

ALTER TABLE mission_strategic_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read strategic signals"
  ON mission_strategic_signals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM engagement_members
    WHERE engagement_id = mission_strategic_signals.engagement_id
    AND user_id = auth.uid()
  ));

CREATE POLICY "Lead/PM can update strategic signals"
  ON mission_strategic_signals FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM engagement_members
    WHERE engagement_id = mission_strategic_signals.engagement_id
    AND user_id = auth.uid()
    AND role IN ('lead','founder','engagement_lead','pm')
  ));

-- Index for fast per-engagement queries
CREATE INDEX IF NOT EXISTS idx_mss_engagement ON mission_strategic_signals(engagement_id, classification, status);
CREATE INDEX IF NOT EXISTS idx_mss_detected ON mission_strategic_signals(detected_at DESC);
