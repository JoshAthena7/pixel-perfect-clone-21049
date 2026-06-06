// Developer Reset — wipes ALL mission data while preserving auth/users/roles
// and reference tables (expertise_library, federal_compliance_library, atlas_states).
//
// Admin-only. Uses supabaseAdmin to bypass RLS so the delete actually clears
// every row (RLS would otherwise hide rows the current user can't see).
//
// Order matters because of FK chains: child tables first, then missions last.
// Tables that don't exist in this DB are simply skipped.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Every public-schema table that holds mission-linked data. Listed in deletion
// order: child/leaf tables first, then `missions` last. Tables without a
// `mission_id` column but whose contents are meaningless without missions
// (e.g. iris_brief_cache, briefings, comments) are included too.
const TABLES_IN_ORDER = [
  // question-level children
  "question_intelligence_matches",
  "question_intelligence",
  "question_relationships",
  "question_collaboration",
  "question_pulses",
  "question_scores",
  "question_gate_status",
  "alignment_conflicts",
  "mock_scores",
  "score_me_history",
  "score_me_interactions",
  "compliance_check_results",
  "compliance_requirements",
  "reality_updates",
  "research_results",
  "research_tasks",
  "iris_corrections",
  "iris_health_flags",
  "iris_staffing_recommendations",
  "pilot_copilot_messages",
  "client_clarifications",
  "mission_conflict_ack",
  "amendment_changes",
  "rfp_amendments",
  // collaboration & comments
  "comment_resolutions",
  "comments",
  "mentions",
  "note_reads",
  // signals / escalations
  "signals",
  // checkins / pulses
  "checkin_section_updates",
  "checkin_submissions",
  "checkin_tokens",
  "checkin_cycles",
  // threads
  "threads",
  // mission intelligence layer
  "mission_intelligence_dna",
  "mission_intelligence_scores",
  "mission_expertise_signals",
  "mission_member_expertise",
  "mission_client_intel",
  "mission_monitoring_sources",
  "mission_evaluation_criteria",
  "mission_sensitivities",
  "mission_assumptions",
  "mission_outcomes",
  "mission_debriefs",
  "mission_decisions",
  "mission_review_gates",
  "mission_risks",
  "mission_strategy",
  "mission_timeline",
  "mission_governance",
  "mission_financials",
  "mission_volumes",
  "mission_library",
  "mission_vault_documents",
  "mission_response_template_elements",
  "mission_response_template_versions",
  "mission_response_templates",
  "win_themes",
  "executive_decisions",
  "contributions",
  "document_extractions",
  "market_intelligence",
  "broadcasts",
  "canon_suggestions",
  "support_responses",
  "support_requests",
  // briefings
  "briefing_acknowledgments",
  "briefing_book_section_history",
  "briefing_book_sections",
  "briefings",
  "iris_brief_cache",
  // atlas mission-linked
  "atlas_knowledge_objects",
  "atlas_sources",
  // graph & embeddings
  "graph_edges",
  "graph_nodes",
  "embeddings",
  // sections + questions + members (last children of missions)
  "mission_sections",
  "question_records",
  "mission_members",
  // root
  "missions",
];

export const resetAllMissionData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ confirm: z.literal("RESET") }).parse(d),
  )
  .handler(async ({ context }) => {
    const { userId } = context;

    // Admin gate — admin role required, no exceptions.
    const { data: roles, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");
    if (roleErr) throw new Error(`Auth check failed: ${roleErr.message}`);
    if (!roles || roles.length === 0) {
      throw new Error("Only platform admins can run the developer reset.");
    }

    // Use service-role client so RLS doesn't hide rows from the delete.
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const results: Array<{ table: string; deleted: number; skipped?: string }> = [];

    for (const table of TABLES_IN_ORDER) {
      // .neq on a guaranteed-present id column lets us delete every row
      // without `truncate` privileges. We use `gte` on created_at as a
      // universal "match all" since not every table has a UUID id column
      // — but every table we listed has either id or created_at. Use a
      // raw filter that matches everything: `not.is.null` on `*`.
      // Simplest universal: `delete().not("ctid", "is", null)` — ctid
      // exists on every row. But PostgREST doesn't expose ctid; use a
      // permissive filter on the primary key by selecting any column.
      // We just do delete().gte("created_at", '1900-01-01') with a
      // fallback to .neq("id", a non-existent uuid) if no created_at.
      const { error, count } = await (supabaseAdmin as any)
        .from(table)
        .delete({ count: "exact" })
        .gte("created_at", "1900-01-01");

      if (error) {
        // Table may not exist or lack created_at — try fallback delete by id.
        const fb = await (supabaseAdmin as any)
          .from(table)
          .delete({ count: "exact" })
          .neq("id", "00000000-0000-0000-0000-000000000000");
        if (fb.error) {
          // Table genuinely missing or some other issue — record and continue.
          results.push({ table, deleted: 0, skipped: fb.error.message });
          continue;
        }
        results.push({ table, deleted: fb.count ?? 0 });
        continue;
      }
      results.push({ table, deleted: count ?? 0 });
    }

    // Audit log
    const totalDeleted = results.reduce((a, b) => a + b.deleted, 0);
    await (supabaseAdmin as any).from("olympus_audit_log").insert({
      actor_user_id: userId,
      action_type: "developer.reset_all_mission_data",
      action_summary: `Developer reset wiped ${totalDeleted} rows across ${results.filter((r) => !r.skipped).length} tables`,
      details: { results },
    });

    return {
      ok: true as const,
      totalDeleted,
      tablesCleared: results.filter((r) => !r.skipped).length,
      tablesSkipped: results.filter((r) => r.skipped),
    };
  });
