-- ================================================================
-- MISSION ADMINISTRATION
-- Admin-only configuration, parameters, workflow, and closeout
-- ================================================================

-- 1. Extend engagements with admin fields
ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS mission_type       TEXT DEFAULT 'RFP'
    CHECK (mission_type IN ('RFP','Pre-Procurement','Growth Strategy','Product Design','Market Assessment','Due Diligence')),
  ADD COLUMN IF NOT EXISTS program            TEXT,
  ADD COLUMN IF NOT EXISTS engagement_lead    TEXT,
  ADD COLUMN IF NOT EXISTS project_manager    TEXT,
  ADD COLUMN IF NOT EXISTS executive_sponsor  TEXT,
  ADD COLUMN IF NOT EXISTS phase              TEXT DEFAULT 'Planning'
    CHECK (phase IN ('Planning','Active','On Hold','Complete','Archived')),
  -- Mission Parameters (drive automation)
  ADD COLUMN IF NOT EXISTS daily_huddle_required  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS sos_enabled            BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS iris_monitoring        BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS executive_visibility   BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_threshold         TEXT DEFAULT 'Yellow'
    CHECK (risk_threshold IN ('Green','Yellow','Red')),
  ADD COLUMN IF NOT EXISTS workflow_type          TEXT DEFAULT 'rfp',
  -- Closeout
  ADD COLUMN IF NOT EXISTS closed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by             TEXT;

-- 2. Mission closeout reports
CREATE TABLE IF NOT EXISTS mission_closeout (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id       UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE UNIQUE,
  outcome             TEXT,
  win_loss            TEXT CHECK (win_loss IN ('Win','Loss','No Bid','Cancelled','Pending')),
  final_score         NUMERIC(5,2),
  lessons_learned     TEXT,
  key_decisions       TEXT,
  strengths           TEXT,
  improvements        TEXT,
  institutional_notes TEXT,   -- feeds IRIS mission memory
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id)
);
ALTER TABLE mission_closeout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read closeout" ON mission_closeout FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = mission_closeout.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Admin insert closeout" ON mission_closeout FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = mission_closeout.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead')));
CREATE POLICY "Admin update closeout" ON mission_closeout FOR UPDATE
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = mission_closeout.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead')));

-- 3. Mission workflow steps (configurable per mission)
CREATE TABLE IF NOT EXISTS mission_workflow_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL DEFAULT 0,
  step_name       TEXT NOT NULL,
  step_type       TEXT NOT NULL,  -- 'draft','review','approval','submission'
  is_required     BOOLEAN DEFAULT true,
  is_complete     BOOLEAN DEFAULT false,
  assignee_role   TEXT,
  due_offset_days INTEGER,        -- days before submission_date
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE mission_workflow_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read workflow" ON mission_workflow_steps FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = mission_workflow_steps.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Admin manage workflow" ON mission_workflow_steps FOR ALL
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = mission_workflow_steps.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- 4. Default workflow templates per mission type
CREATE OR REPLACE FUNCTION seed_default_workflow(e_id UUID, m_type TEXT)
RETURNS VOID AS $$
DECLARE
  steps TEXT[];
  s TEXT;
  i INTEGER := 1;
BEGIN
  IF m_type = 'RFP' THEN
    steps := ARRAY['Question Assignment','Writer Drafting','SME Review','QA Review','Red Team','Gold Team','Final Submission'];
  ELSIF m_type = 'Pre-Procurement' THEN
    steps := ARRAY['Intelligence Gathering','Strategy Development','Positioning','Go/No-Go Review'];
  ELSIF m_type = 'Growth Strategy' THEN
    steps := ARRAY['Market Analysis','Strategy Development','Leadership Review','Presentation'];
  ELSE
    steps := ARRAY['Discovery','Analysis','Delivery','Review'];
  END IF;
  
  FOREACH s IN ARRAY steps LOOP
    INSERT INTO mission_workflow_steps (engagement_id, step_order, step_name, step_type)
    VALUES (e_id, i, s, 'draft')
    ON CONFLICT DO NOTHING;
    i := i + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
