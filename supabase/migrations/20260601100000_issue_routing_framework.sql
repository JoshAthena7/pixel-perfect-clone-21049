-- ================================================================
-- ISSUE ROUTING & ESCALATION FRAMEWORK
-- Proposal Issues → Engagement Leader (affects quality)
-- Operational Support Requests → Project Manager (affects execution)
-- ================================================================

CREATE TABLE IF NOT EXISTS issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,

  -- ROUTING DISCRIMINATOR (never null, drives all routing logic)
  issue_type      TEXT NOT NULL CHECK (issue_type IN ('proposal', 'operational')),

  -- Common fields
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  requested_assistance TEXT,
  severity        TEXT NOT NULL DEFAULT 'Medium'
    CHECK (severity IN ('Low', 'Medium', 'High', 'Critical')),
  status          TEXT NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'In Progress', 'Escalated', 'Resolved', 'Closed')),

  -- Submission
  submitted_by    TEXT NOT NULL,
  submitted_by_role TEXT,
  user_id         UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  -- Auto-routing
  assigned_to     TEXT,      -- display name of assignee
  assigned_role   TEXT CHECK (assigned_role IN ('lead','pm','operations')),

  -- PROPOSAL ISSUE fields (issue_type = 'proposal')
  question_id     UUID REFERENCES rfp_questions(id) ON DELETE SET NULL,
  question_ref    TEXT,      -- question number for display
  section_name    TEXT,

  -- Proposal-specific categories
  proposal_category TEXT CHECK (proposal_category IN (
    'Missing SME Input','Compliance Concern','Weak Response Strategy',
    'Missing Data','Question Interpretation','Win Theme Concern',
    'Graphics Dependency','Conflicting Guidance','Content Quality',
    'Reviewer Concern','Red Team Finding','Gold Team Finding',
    'Unclear Requirement','Scoring Concern','Other'
  )),

  -- OPERATIONAL REQUEST fields (issue_type = 'operational')
  operational_category TEXT CHECK (operational_category IN (
    'IT Access','SharePoint Access','Teams Access','Credential Issue',
    'Timesheet','TalentDesk','Contract','Travel','Scheduling',
    'Meeting Support','Software Access','Administrative','Other'
  )),

  -- Resolution
  resolution_notes TEXT,
  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,

  -- IRIS tracking
  iris_flagged    BOOLEAN DEFAULT false,
  iris_signal     TEXT
);

ALTER TABLE issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read issues"
  ON issues FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM engagement_members
    WHERE engagement_id = issues.engagement_id AND user_id = auth.uid()
  ));

CREATE POLICY "Members insert issues"
  ON issues FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM engagement_members
    WHERE engagement_id = issues.engagement_id AND user_id = auth.uid()
  ));

CREATE POLICY "Lead/PM update issues"
  ON issues FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM engagement_members
    WHERE engagement_id = issues.engagement_id
    AND user_id = auth.uid()
    AND role IN ('lead','founder','engagement_lead','pm')
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_issues_engagement ON issues(engagement_id, issue_type, status);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(engagement_id, severity, status);
CREATE INDEX IF NOT EXISTS idx_issues_question ON issues(question_id) WHERE question_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at DESC);

-- Trigger: when a proposal issue is created/resolved, update rfp_questions.open_issues
CREATE OR REPLACE FUNCTION sync_question_issue_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.issue_type = 'proposal' AND NEW.question_id IS NOT NULL THEN
    UPDATE rfp_questions
      SET open_issues = COALESCE(open_issues, 0) + 1, updated_at = now()
      WHERE id = NEW.question_id;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.issue_type = 'proposal' AND NEW.question_id IS NOT NULL THEN
    IF NEW.status IN ('Resolved','Closed') AND OLD.status NOT IN ('Resolved','Closed') THEN
      UPDATE rfp_questions
        SET open_issues = GREATEST(0, COALESCE(open_issues, 1) - 1), updated_at = now()
        WHERE id = NEW.question_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER issue_question_sync
  AFTER INSERT OR UPDATE ON issues
  FOR EACH ROW EXECUTE FUNCTION sync_question_issue_count();
