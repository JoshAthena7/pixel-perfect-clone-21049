// Daily IRIS Intelligence Refresh
// Called by pg_cron once per day. For every mission with a current
// Intelligence DNA, re-queues the top high-priority research questions
// as fresh research_tasks and executes them through Perplexity, so the
// Mission Intelligence Feed stays current with new citations and findings.
import { createFileRoute } from "@tanstack/react-router";
import { runOneTask } from "@/lib/iris-research.functions";
import type { MissionDna } from "@/lib/iris-dna.functions";

const MAX_QUESTIONS_PER_MISSION = 6;
const DELAY_BETWEEN_CALLS_MS = 700;

export const Route = createFileRoute("/api/public/hooks/refresh-intelligence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Auth via dedicated server-side cron secret (never shipped to the browser)
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        const expected = process.env.CRON_HOOK_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // 1. Find every mission with a current DNA
        const { data: dnaRows, error: dnaErr } = await supabaseAdmin
          .from("mission_intelligence_dna")
          .select("mission_id, dna")
          .eq("is_current", true);
        if (dnaErr) {
          return new Response(
            JSON.stringify({ error: dnaErr.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        const missions = dnaRows ?? [];
        let totalQueued = 0;
        let totalSucceeded = 0;
        let totalFailed = 0;
        const missionResults: Array<{
          mission_id: string;
          queued: number;
          succeeded: number;
          failed: number;
          error?: string;
        }> = [];

        for (const row of missions) {
          const missionId = row.mission_id as string;
          const dna = row.dna as unknown as MissionDna;
          const questions = Array.isArray(dna?.intelligence_questions)
            ? dna.intelligence_questions
            : [];

          // Pick top high-priority questions for the daily refresh
          const sorted = [...questions].sort((a, b) => {
            const rank = (u: unknown) =>
              u === "high" ? 0 : u === "medium" ? 1 : 2;
            return rank(a?.urgency) - rank(b?.urgency);
          });
          const picks = sorted.slice(0, MAX_QUESTIONS_PER_MISSION);
          if (picks.length === 0) {
            missionResults.push({
              mission_id: missionId,
              queued: 0,
              succeeded: 0,
              failed: 0,
            });
            continue;
          }

          // Insert as fresh pending tasks (refresh batch)
          const rows = picks.map((q) => ({
            mission_id: missionId,
            question: String(q.question ?? "").slice(0, 2000),
            why_it_matters: String(q.why_it_matters ?? "").slice(0, 2000),
            relevant_rfp_sections: Array.isArray(q.relevant_sections)
              ? q.relevant_sections.slice(0, 12)
              : [],
            priority: ["high", "medium", "low"].includes(q.urgency)
              ? q.urgency
              : "medium",
            status: "pending" as const,
          }));

          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("research_tasks")
            .insert(rows)
            .select(
              "id, mission_id, question, why_it_matters, relevant_rfp_sections",
            );

          if (insErr || !inserted) {
            missionResults.push({
              mission_id: missionId,
              queued: 0,
              succeeded: 0,
              failed: 0,
              error: insErr?.message ?? "insert failed",
            });
            continue;
          }

          totalQueued += inserted.length;
          let succeeded = 0;
          let failed = 0;

          for (const task of inserted) {
            const r = await runOneTask(
              supabaseAdmin,
              task as Parameters<typeof runOneTask>[1],
              dna,
            );
            if (r.ok) succeeded++;
            else failed++;
            await new Promise((res) =>
              setTimeout(res, DELAY_BETWEEN_CALLS_MS),
            );
          }

          totalSucceeded += succeeded;
          totalFailed += failed;
          missionResults.push({
            mission_id: missionId,
            queued: inserted.length,
            succeeded,
            failed,
          });

          // Audit per mission
          await supabaseAdmin.from("olympus_audit_log").insert({
            mission_id: missionId,
            action_type: "iris_intelligence_refreshed",
            action_summary: `Daily IRIS refresh: ${inserted.length} questions re-researched (${succeeded} succeeded, ${failed} failed)`,
            target_table: "research_tasks",
          });
        }

        return new Response(
          JSON.stringify({
            ok: true,
            missions: missions.length,
            queued: totalQueued,
            succeeded: totalSucceeded,
            failed: totalFailed,
            results: missionResults,
            ran_at: new Date().toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
