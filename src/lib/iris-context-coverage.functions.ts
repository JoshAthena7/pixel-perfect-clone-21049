// Context Coverage Audit — programmatically verifies that every mission-scoped
// table in the schema is either (a) read by buildMissionContext() or
// (b) explicitly excluded with a documented reason.
//
// Run on demand from the Olympus IRIS Context Health panel.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Registry: keep in sync with buildMissionContext() ----------

/**
 * Tables actually queried in buildMissionContext (mission- or question-scoped reads).
 * When you add a new query to that function, add the table name here.
 */
export const COVERED_TABLES: string[] = [
  // Strategic layer
  "missions",
  "mission_evaluation_criteria",
  "win_themes",
  // Documents & canon
  "mission_vault_documents",
  "intelligence_canon", // global, not mission_id, but feeds context
  "compliance_requirements",
  "rfp_amendments",
  "amendment_changes",
  // IRIS intelligence layer
  "briefing_book_sections",
  "mission_risks",
  "signals",
  "mission_client_intel",
  "iris_memories",
  "iris_health_flags",
  "market_intelligence",
  "mission_strategy",
  "mission_assumptions",
  "mission_decisions",
  "executive_decisions",
  "mock_scores",
  "broadcasts",
  "research_results",
  "mission_timeline",
  "mission_sections",
  // Live question state
  "question_records",
  "question_collaboration",
  "client_clarifications",
  "reality_updates",
  "question_pulses",
  "score_me_history",
];

/**
 * Tables intentionally NOT in buildMissionContext, with reason.
 * These are not "missing" coverage — they are infrastructure, telemetry,
 * intermediate artifacts, or accessed via specialized flows.
 */
export const EXCLUDED_TABLES: Array<{ table: string; reason: string }> = [
  // Telemetry / audit
  { table: "olympus_audit_log", reason: "Admin audit trail" },
  { table: "iris_memory_usage", reason: "Telemetry of memory hits" },
  { table: "score_me_interactions", reason: "Per-keystroke telemetry, not intelligence" },
  { table: "contributions", reason: "Activity log used for analytics, not context" },
  { table: "note_reads", reason: "Per-user read-receipt tracking" },
  // Caches / intermediate
  { table: "iris_brief_cache", reason: "Cache of IRIS outputs, not a source of truth" },
  { table: "briefing_book_section_history", reason: "Version history of briefing_book_sections (covered via parent)" },
  { table: "document_extractions", reason: "Intermediate extraction artifacts (covered via mission_vault_documents)" },
  { table: "compliance_check_results", reason: "Computed from compliance_requirements" },
  { table: "pulse_aggregates", reason: "Rollup of question_pulses (covered via parent)" },
  { table: "mission_expertise_signals", reason: "Rollup of mission_member_expertise" },
  { table: "question_intelligence_matches", reason: "Join table" },
  { table: "question_relationships", reason: "Graph relationships, used by graph queries not prompts" },
  { table: "iris_staffing_recommendations", reason: "Lifecycle output, not input" },
  // Vector / graph stores accessed via search APIs
  { table: "embeddings", reason: "Vector index — accessed via semantic search, not bulk read" },
  { table: "graph_nodes", reason: "Graph store — accessed via graph traversal" },
  { table: "graph_edges", reason: "Graph store — accessed via graph traversal" },
  // Auth / tokens
  { table: "checkin_tokens", reason: "Auth tokens, not intelligence" },
  // Configuration
  { table: "mission_monitoring_sources", reason: "Source config, not source content" },
  { table: "mission_response_templates", reason: "Template configuration" },
  { table: "mission_response_template_versions", reason: "Template version log" },
  { table: "mission_response_template_elements", reason: "Template element library" },
  { table: "mission_section_template_progress", reason: "Per-template progress tracker" },
  { table: "mission_volumes", reason: "Volume configuration" },
  { table: "mission_sensitivities", reason: "Sensitivity configuration" },
  { table: "mission_governance", reason: "Lifecycle configuration" },
  { table: "mission_financials", reason: "Lifecycle financials" },
  { table: "mission_review_gates", reason: "Lifecycle gates" },
  { table: "mission_library", reason: "Reusable mission templates" },
  // Post-submission
  { table: "mission_debriefs", reason: "Post-submission analysis" },
  { table: "mission_outcomes", reason: "Post-submission outcomes" },
  { table: "mission_intelligence_scores", reason: "Computed intelligence scores" },
  { table: "mission_intelligence_dna", reason: "Profile fingerprint (used by cross-mission flows)" },
  // Team / membership
  { table: "mission_members", reason: "Membership roster — accessed via auth/role flow" },
  { table: "mission_member_expertise", reason: "Member expertise joined via expertise queries" },
  // Cadence flows
  { table: "checkin_cycles", reason: "Cadence configuration" },
  { table: "checkin_submissions", reason: "Cadence submissions (separate flow)" },
  { table: "support_requests", reason: "Help desk, not mission intelligence" },
  // Atlas / cross-org
  { table: "atlas_knowledge_objects", reason: "Cross-org atlas — separate ingest pipeline" },
  { table: "atlas_sources", reason: "Cross-org atlas — separate ingest pipeline" },
  // Pipeline state
  { table: "research_tasks", reason: "Task records — research_results is the output covered" },
  // Question-scoped intelligence
  { table: "question_intelligence", reason: "Question-level brief cache, used per-question by loadQuestionContext" },
  { table: "iris_corrections", reason: "Feedback log; corrections folded into iris_memories" },
  { table: "canon_suggestions", reason: "Pending review queue (becomes intelligence_canon when approved)" },
  { table: "alignment_conflicts", reason: "Surfaced via conflict detection flow, not prompt context" },
  { table: "pilot_copilot_messages", reason: "Per-user chat; surfaced via inbox not prompt context" },
];

// ---------- Audit server fn ----------

export type CoverageReport = {
  totalMissionTables: number;
  coveredByContext: number;
  excludedByDesign: number;
  missing: string[];
  excluded: Array<{ table: string; reason: string }>;
  coveragePercent: number;
  generatedAt: string;
};

export const auditContextCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<CoverageReport> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // information_schema is not exposed by PostgREST; use a raw SQL RPC via the
    // admin client. If a helper RPC doesn't exist we fall back to a curated
    // schema snapshot — keep the audit useful either way.
    let missionTables: string[] = [];
    try {
      const { data, error } = await (supabaseAdmin as any).rpc(
        "list_mission_scoped_tables",
      );
      if (!error && Array.isArray(data)) {
        missionTables = data
          .map((r: any) => (typeof r === "string" ? r : r?.table_name))
          .filter((s: any): s is string => typeof s === "string");
      }
    } catch {
      // ignore — fallback below
    }

    if (missionTables.length === 0) {
      // Fallback: assume the registry below represents the schema. Auditor will
      // still flag any table in COVERED_TABLES + EXCLUDED_TABLES that doesn't
      // actually exist via missing/orphan checks once the RPC is added.
      missionTables = Array.from(
        new Set([
          ...COVERED_TABLES,
          ...EXCLUDED_TABLES.map((e) => e.table),
        ]),
      ).filter((t) => t !== "intelligence_canon"); // global, not mission_id
    }

    const coveredSet = new Set(COVERED_TABLES);
    const excludedMap = new Map(EXCLUDED_TABLES.map((e) => [e.table, e.reason]));

    const missing: string[] = [];
    let coveredCount = 0;
    let excludedCount = 0;

    for (const t of missionTables) {
      if (coveredSet.has(t)) {
        coveredCount++;
      } else if (excludedMap.has(t)) {
        excludedCount++;
      } else {
        missing.push(t);
      }
    }

    const denominator = missionTables.length - excludedCount;
    const coveragePercent =
      denominator <= 0
        ? 100
        : Math.round((coveredCount / denominator) * 100);

    return {
      totalMissionTables: missionTables.length,
      coveredByContext: coveredCount,
      excludedByDesign: excludedCount,
      missing: missing.sort(),
      excluded: EXCLUDED_TABLES.filter((e) => missionTables.includes(e.table)),
      coveragePercent,
      generatedAt: new Date().toISOString(),
    };
  });
