-- ================================================================
-- PIPELINE HORIZON ARCHITECTURE
-- Athena's market awareness engine — curated, interpreted, linked
-- Feeds: Lobby → Mission Brain → IRIS → Command Center
-- ================================================================

CREATE TABLE IF NOT EXISTS pipeline_horizon (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title                 TEXT NOT NULL,
  summary               TEXT NOT NULL,
  source                TEXT NOT NULL,   -- "Federal Register", "Congress.gov", "Perplexity", etc.
  source_url            TEXT,
  source_type           TEXT NOT NULL CHECK (source_type IN (
    'federal','market','procurement','state','athena','competitive','policy'
  )),

  -- Horizon category (display bucketing)
  horizon_category      TEXT NOT NULL CHECK (horizon_category IN (
    'Federal Signal','Market Signal','Procurement Signal','State Signal','Athena Signal'
  )),

  -- Dates
  published_at          TIMESTAMPTZ,
  ingested_at           TIMESTAMPTZ DEFAULT now(),

  -- IRIS interpretation (pre-computed for Lobby display speed)
  iris_type             TEXT CHECK (iris_type IN ('signal','alert','insight','recommendation')),
  iris_headline         TEXT,      -- one-line IRIS interpretation
  iris_detail           TEXT,      -- 2-3 sentence IRIS analysis
  iris_action           TEXT,      -- recommended action if any
  iris_processed_at     TIMESTAMPTZ,

  -- Relevance scoring
  strategic_relevance   NUMERIC(4,3) DEFAULT 0.5,
  urgency_score         NUMERIC(4,3) DEFAULT 0.5,
  confidence_score      NUMERIC(4,3) DEFAULT 0.7,

  -- Context tags
  affected_states       TEXT[],
  affected_programs     TEXT[],    -- LTSS, Care Management, Behavioral Health, etc.
  affected_agencies     TEXT[],
  affected_competitors  TEXT[],

  -- Institutional memory
  leadership_actions    TEXT,      -- what leadership did after seeing this
  outcome_notes         TEXT,      -- what happened as a result
  reference_count       INTEGER DEFAULT 0, -- how many times referenced by IRIS

  -- Source tracking
  market_intelligence_id UUID REFERENCES market_intelligence(id) ON DELETE SET NULL,
  embedding             vector(1536), -- for semantic search

  -- Curation
  is_curated            BOOLEAN DEFAULT true,
  is_mission_specific   BOOLEAN DEFAULT false, -- if true, only shows in Mission Brain
  status                TEXT DEFAULT 'active' CHECK (status IN ('active','archived','dismissed'))
);

-- Mission links (many-to-many)
CREATE TABLE IF NOT EXISTS pipeline_horizon_missions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horizon_id      UUID NOT NULL REFERENCES pipeline_horizon(id) ON DELETE CASCADE,
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  match_score     NUMERIC(4,3),
  match_reason    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(horizon_id, engagement_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ph_category   ON pipeline_horizon(horizon_category, status, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_ph_relevance  ON pipeline_horizon(strategic_relevance DESC, urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_ph_type       ON pipeline_horizon(iris_type, status);
CREATE INDEX IF NOT EXISTS idx_phm_eng       ON pipeline_horizon_missions(engagement_id);
CREATE INDEX IF NOT EXISTS idx_phm_horizon   ON pipeline_horizon_missions(horizon_id);
