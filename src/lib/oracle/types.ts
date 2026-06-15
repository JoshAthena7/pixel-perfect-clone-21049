// ORACLE V1 — row, insert, and update types for the oracle_* tables.
// Hand-authored to match supabase/migrations/*oracle_v1_schema*.sql.
// Keep in sync with the migration; do not import from src/integrations/supabase/types.ts
// (those generated types are regenerated on migration approval and will eventually
//  surface these tables too — until then, this module is the source of truth).

export type OracleMonitoringMode = "conservative" | "balanced" | "aggressive";
export type OracleConfigStatus = "draft" | "active" | "paused" | "archived";

export type OracleSourceType =
  | "agency"
  | "procurement"
  | "policy"
  | "competitor"
  | "stakeholder"
  | "market"
  | "internal";
export type OracleSourceCategory =
  | "agency_watch"
  | "procurement_watch"
  | "policy_watch"
  | "competitor_watch"
  | "stakeholder_watch"
  | "market_watch";
export type OracleSourcePriority = "low" | "medium" | "high";
export type OracleSourceStatus = "active" | "paused" | "ignored";
export type OracleSourceAddedBy = "iris_generated" | "admin_added" | "system";
export type OracleRefreshCadence = "hourly" | "daily" | "weekly" | "manual";

export type OracleRawItemStatus = "new" | "processed" | "archived" | "error";

export type OracleSignalType =
  | "policy"
  | "procurement"
  | "competitor"
  | "stakeholder"
  | "market"
  | "operational";
export type OracleSignalStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "rejected"
  | "archived"
  | "pushed";
export type OracleSignalVisibility = "admin_only" | "leadership" | "all_users";

export type OracleTagType =
  | "win_theme"
  | "risk"
  | "question"
  | "section"
  | "stakeholder"
  | "competitor";

export type OracleBeliefType =
  | "win_theme"
  | "risk"
  | "assumption"
  | "stakeholder"
  | "competitor"
  | "policy";
export type OracleBeliefStatus = "active" | "challenged" | "retired";
export type OracleBeliefRelationship = "supports" | "challenges" | "creates";

export type OracleOutputType =
  | "mission_brief"
  | "how_we_win"
  | "flight_risk"
  | "todays_focus"
  | "mission_pulse"
  | "question_brief";
export type OracleOutputStatus = "draft" | "published" | "archived";

export type OracleHealthStatus = "green" | "yellow" | "red";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

/* ---------- oracle_engagement_config ---------- */
export interface OracleEngagementConfigRow {
  id: string;
  mission_id: string;
  north_star: string | null;
  win_themes: Json;
  top_risks: Json;
  signal_threshold: number;
  monitoring_mode: OracleMonitoringMode;
  status: OracleConfigStatus;
  created_at: string;
  updated_at: string;
}
export type OracleEngagementConfigInsert = {
  id?: string;
  mission_id: string;
  north_star?: string | null;
  win_themes?: Json;
  top_risks?: Json;
  signal_threshold?: number;
  monitoring_mode?: OracleMonitoringMode;
  status?: OracleConfigStatus;
  created_at?: string;
  updated_at?: string;
};
export type OracleEngagementConfigUpdate = Partial<OracleEngagementConfigInsert>;

/* ---------- oracle_sources ---------- */
export interface OracleSourceRow {
  id: string;
  mission_id: string;
  source_name: string;
  source_url: string | null;
  source_type: OracleSourceType;
  category: OracleSourceCategory;
  priority: OracleSourcePriority;
  status: OracleSourceStatus;
  added_by: OracleSourceAddedBy;
  refresh_cadence: OracleRefreshCadence;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}
export type OracleSourceInsert = {
  id?: string;
  mission_id: string;
  source_name: string;
  source_url?: string | null;
  source_type: OracleSourceType;
  category: OracleSourceCategory;
  priority?: OracleSourcePriority;
  status?: OracleSourceStatus;
  added_by?: OracleSourceAddedBy;
  refresh_cadence?: OracleRefreshCadence;
  last_checked_at?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type OracleSourceUpdate = Partial<OracleSourceInsert>;

/* ---------- oracle_raw_items ---------- */
export interface OracleRawItemRow {
  id: string;
  mission_id: string;
  source_id: string | null;
  title: string;
  url: string | null;
  raw_text: string | null;
  summary: string | null;
  published_at: string | null;
  ingested_at: string;
  content_hash: string | null;
  duplicate_of: string | null;
  status: OracleRawItemStatus;
  created_at: string;
}
export type OracleRawItemInsert = {
  id?: string;
  mission_id: string;
  source_id?: string | null;
  title: string;
  url?: string | null;
  raw_text?: string | null;
  summary?: string | null;
  published_at?: string | null;
  ingested_at?: string;
  content_hash?: string | null;
  duplicate_of?: string | null;
  status?: OracleRawItemStatus;
  created_at?: string;
};
export type OracleRawItemUpdate = Partial<OracleRawItemInsert>;

/* ---------- oracle_signals ---------- */
export interface OracleSignalRow {
  id: string;
  mission_id: string;
  raw_item_id: string | null;
  signal_type: OracleSignalType;
  title: string;
  what_happened: string | null;
  why_it_matters: string | null;
  recommended_action: string | null;
  confidence_score: number;
  relevance_score: number;
  impact_score: number;
  urgency_score: number;
  /** Generated column: 0.40*relevance + 0.25*urgency + 0.25*impact + 0.10*confidence (rounded). */
  oracle_score: number;
  status: OracleSignalStatus;
  visibility: OracleSignalVisibility;
  created_at: string;
  updated_at: string;
}
export type OracleSignalInsert = {
  id?: string;
  mission_id: string;
  raw_item_id?: string | null;
  signal_type: OracleSignalType;
  title: string;
  what_happened?: string | null;
  why_it_matters?: string | null;
  recommended_action?: string | null;
  confidence_score?: number;
  relevance_score?: number;
  impact_score?: number;
  urgency_score?: number;
  status?: OracleSignalStatus;
  visibility?: OracleSignalVisibility;
  created_at?: string;
  updated_at?: string;
  // oracle_score is GENERATED — never insert/update.
};
export type OracleSignalUpdate = Partial<OracleSignalInsert>;

/* ---------- oracle_signal_tags ---------- */
export interface OracleSignalTagRow {
  id: string;
  signal_id: string;
  tag_type: OracleTagType;
  tag_value: string;
  created_at: string;
}
export type OracleSignalTagInsert = {
  id?: string;
  signal_id: string;
  tag_type: OracleTagType;
  tag_value: string;
  created_at?: string;
};
export type OracleSignalTagUpdate = Partial<OracleSignalTagInsert>;

/* ---------- oracle_beliefs ---------- */
export interface OracleBeliefRow {
  id: string;
  mission_id: string;
  belief_text: string;
  belief_type: OracleBeliefType;
  confidence: number;
  status: OracleBeliefStatus;
  created_at: string;
  updated_at: string;
}
export type OracleBeliefInsert = {
  id?: string;
  mission_id: string;
  belief_text: string;
  belief_type: OracleBeliefType;
  confidence?: number;
  status?: OracleBeliefStatus;
  created_at?: string;
  updated_at?: string;
};
export type OracleBeliefUpdate = Partial<OracleBeliefInsert>;

/* ---------- oracle_signal_belief_links ---------- */
export interface OracleSignalBeliefLinkRow {
  id: string;
  signal_id: string;
  belief_id: string;
  relationship: OracleBeliefRelationship;
  explanation: string | null;
  created_at: string;
}
export type OracleSignalBeliefLinkInsert = {
  id?: string;
  signal_id: string;
  belief_id: string;
  relationship: OracleBeliefRelationship;
  explanation?: string | null;
  created_at?: string;
};
export type OracleSignalBeliefLinkUpdate = Partial<OracleSignalBeliefLinkInsert>;

/* ---------- oracle_outputs ---------- */
export interface OracleOutputRow {
  id: string;
  mission_id: string;
  signal_id: string | null;
  output_type: OracleOutputType;
  title: string;
  content: string;
  target_question_id: string | null;
  target_section_id: string | null;
  status: OracleOutputStatus;
  created_at: string;
  updated_at: string;
}
export type OracleOutputInsert = {
  id?: string;
  mission_id: string;
  signal_id?: string | null;
  output_type: OracleOutputType;
  title: string;
  content: string;
  target_question_id?: string | null;
  target_section_id?: string | null;
  status?: OracleOutputStatus;
  created_at?: string;
  updated_at?: string;
};
export type OracleOutputUpdate = Partial<OracleOutputInsert>;

/* ---------- oracle_health ---------- */
export interface OracleHealthRow {
  id: string;
  mission_id: string;
  total_sources: number;
  active_sources: number;
  raw_items_ingested: number;
  signals_created: number;
  signals_approved: number;
  signals_archived: number;
  noise_ratio: number | null;
  coverage_gaps: Json;
  health_status: OracleHealthStatus;
  created_at: string;
}
export type OracleHealthInsert = {
  id?: string;
  mission_id: string;
  total_sources?: number;
  active_sources?: number;
  raw_items_ingested?: number;
  signals_created?: number;
  signals_approved?: number;
  signals_archived?: number;
  noise_ratio?: number | null;
  coverage_gaps?: Json;
  health_status?: OracleHealthStatus;
  created_at?: string;
};
export type OracleHealthUpdate = Partial<OracleHealthInsert>;

/* ---------- Wizard staging types ---------- */
export type OracleSignalAuthority = "client_stated" | "team_validated" | "iris_suggested";

export interface OracleTaggedItem {
  id: string;
  text: string;
  signal_authority: OracleSignalAuthority;
  rfp_reference: string | null;
  confidence: number;
  status: "confirmed";
}

export interface OracleWizardStaged {
  north_star?: string | null;
  win_themes?: OracleTaggedItem[];
  top_risks?: OracleTaggedItem[];
  competitors?: string[];
  signal_threshold?: number;
  monitoring_mode?: OracleMonitoringMode;
}

// Document purpose taxonomy — added Phase 1b
export type DocumentPurpose =
  | 'procurement'
  | 'competitive_intel'
  | 'writing_standards'
  | 'client_strategy'
  | 'reference';

// Extended mission document type reflecting Phase 1b columns
export type MissionDocumentPurpose = {
  document_purpose: DocumentPurpose;
  is_style_guide: boolean;
};
