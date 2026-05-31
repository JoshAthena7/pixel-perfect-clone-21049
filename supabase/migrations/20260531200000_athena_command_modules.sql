-- Athena Command Module Tables
-- Adds all tables required by Prompts 2-4 that were not created by Lovable

-- Differentiators
CREATE TABLE IF NOT EXISTS differentiators (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  substantiation  TEXT,
  versus          TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE differentiators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read differentiators"
  ON differentiators FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = differentiators.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can insert differentiators"
  ON differentiators FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = differentiators.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));
CREATE POLICY "Lead/PM can update differentiators"
  ON differentiators FOR UPDATE
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = differentiators.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Assumptions
CREATE TABLE IF NOT EXISTS assumptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  text            TEXT NOT NULL,
  confidence      TEXT DEFAULT 'Medium' CHECK (confidence IN ('High','Medium','Low')),
  risk_if_wrong   TEXT,
  owner           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read assumptions"
  ON assumptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = assumptions.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can insert assumptions"
  ON assumptions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = assumptions.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));
CREATE POLICY "Lead/PM can update assumptions"
  ON assumptions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = assumptions.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Partnerships
CREATE TABLE IF NOT EXISTS partnerships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  partner_name    TEXT NOT NULL,
  role            TEXT,
  commitment      TEXT DEFAULT 'Exploring' CHECK (commitment IN ('Confirmed','Negotiating','Exploring')),
  contact         TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE partnerships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read partnerships"
  ON partnerships FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = partnerships.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can insert partnerships"
  ON partnerships FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = partnerships.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));
CREATE POLICY "Lead/PM can update partnerships"
  ON partnerships FOR UPDATE
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = partnerships.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Terminology
CREATE TABLE IF NOT EXISTS terminology (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  term            TEXT NOT NULL,
  definition      TEXT NOT NULL,
  preferred_usage TEXT,
  context         TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE terminology ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read terminology"
  ON terminology FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = terminology.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can insert terminology"
  ON terminology FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = terminology.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm','writer','sme')));
CREATE POLICY "Lead/PM can update terminology"
  ON terminology FOR UPDATE
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = terminology.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Stakeholders
CREATE TABLE IF NOT EXISTS stakeholders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  title           TEXT,
  organization    TEXT,
  priority        TEXT DEFAULT 'Medium' CHECK (priority IN ('Critical','High','Medium','Low')),
  relationship    TEXT DEFAULT 'Unknown' CHECK (relationship IN ('Champion','Neutral','Risk','Unknown')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE stakeholders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read stakeholders"
  ON stakeholders FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = stakeholders.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can insert stakeholders"
  ON stakeholders FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = stakeholders.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));
CREATE POLICY "Lead/PM can update stakeholders"
  ON stakeholders FOR UPDATE
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = stakeholders.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Change Tracker
CREATE TABLE IF NOT EXISTS change_tracker (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  change_type     TEXT NOT NULL,
  item_name       TEXT,
  description     TEXT NOT NULL,
  impact          TEXT,
  logged_by       TEXT,
  previous_value  TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE change_tracker ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read change_tracker"
  ON change_tracker FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = change_tracker.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can insert change_tracker"
  ON change_tracker FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = change_tracker.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Quality Signals
CREATE TABLE IF NOT EXISTS quality_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  section_name    TEXT NOT NULL,
  submitted_by    TEXT NOT NULL,
  quality         TEXT NOT NULL CHECK (quality IN ('Strong','Good','Needs Work','At Risk')),
  notes           TEXT,
  leadership_needed BOOLEAN DEFAULT false,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE quality_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read quality_signals"
  ON quality_signals FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = quality_signals.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Members can insert quality_signals"
  ON quality_signals FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = quality_signals.engagement_id AND user_id = auth.uid()));

-- Writer Confidence
CREATE TABLE IF NOT EXISTS writer_confidence (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  writer          TEXT NOT NULL,
  section_name    TEXT NOT NULL,
  confidence      INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 5),
  notes           TEXT,
  needs_help      BOOLEAN DEFAULT false,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE writer_confidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read writer_confidence"
  ON writer_confidence FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = writer_confidence.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Members can insert writer_confidence"
  ON writer_confidence FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = writer_confidence.engagement_id AND user_id = auth.uid()));

-- Resource Health
CREATE TABLE IF NOT EXISTS resource_health (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  submitted_by    TEXT NOT NULL,
  staffing        TEXT NOT NULL CHECK (staffing IN ('Adequate','Stretched','Critical')),
  sme_engagement  TEXT NOT NULL CHECK (sme_engagement IN ('Good','Delayed','Missing')),
  timeline_status TEXT NOT NULL CHECK (timeline_status IN ('On Track','At Risk','Behind')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE resource_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read resource_health"
  ON resource_health FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = resource_health.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can insert resource_health"
  ON resource_health FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = resource_health.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Support Requests (separate from SOS)
CREATE TABLE IF NOT EXISTS support_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id   UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  submitted_by    TEXT NOT NULL,
  category        TEXT NOT NULL,
  priority        TEXT DEFAULT 'Normal' CHECK (priority IN ('Normal','High')),
  description     TEXT NOT NULL,
  what_is_needed  TEXT,
  owner           TEXT,
  status          TEXT DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved')),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read support_requests"
  ON support_requests FOR SELECT
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = support_requests.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Members can insert support_requests"
  ON support_requests FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = support_requests.engagement_id AND user_id = auth.uid()));
CREATE POLICY "Lead/PM can update support_requests"
  ON support_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM engagement_members WHERE engagement_id = support_requests.engagement_id AND user_id = auth.uid() AND role IN ('lead','founder','engagement_lead','pm')));

-- Add evidence and status columns to win_themes if missing
ALTER TABLE win_themes ADD COLUMN IF NOT EXISTS evidence TEXT;
ALTER TABLE win_themes ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE win_themes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active' CHECK (status IN ('Active','Draft','Retired'));
