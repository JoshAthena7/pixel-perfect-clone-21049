import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateMissionQuestionBriefs } from "@/lib/iris-question-brief.functions";

/**
 * Auto-IRIS kickoff for a mission.
 *
 * Called automatically when a mission is set up in Olympus (after the RFP is
 * parsed and again on activation). Marks `missions.iris_kickoff_status` so the
 * UI can show "IRIS is reading your RFP", then runs the morning-brief loop
 * across every question. Per-question coaching stays on-demand (cheaper and
 * already lazy-cached when a writer opens the question).
 *
 * Safe to call multiple times: `generateMissionQuestionBriefs` skips
 * questions that already have a brief unless `overwrite=true`.
 */
export const kickoffMissionIris = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        overwrite: z.boolean().optional().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const startedAt = new Date().toISOString();

    // If another kickoff for this mission is already running (within the last
    // 10 minutes), don't fire a second one — it would race on the same rows.
    const { data: existing } = await supabase
      .from("missions")
      .select("iris_kickoff_status, iris_kickoff_at")
      .eq("id", data.missionId)
      .maybeSingle();
    if (existing?.iris_kickoff_status === "running" && existing.iris_kickoff_at) {
      const ageMs = Date.now() - new Date(existing.iris_kickoff_at).getTime();
      if (ageMs < 10 * 60 * 1000) {
        return { ok: true, skipped: true, reason: "already_running" as const };
      }
    }

    await supabase
      .from("missions")
      .update({
        iris_kickoff_status: "running",
        iris_kickoff_at: startedAt,
      })
      .eq("id", data.missionId);

    try {
      const briefs = await generateMissionQuestionBriefs({
        data: { missionId: data.missionId, overwrite: data.overwrite },
      });

      const summary = {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        briefs,
      };

      await supabase
        .from("missions")
        .update({
          iris_kickoff_status: "complete",
          iris_kickoff_summary: summary,
        })
        .eq("id", data.missionId);

      return { ok: true, skipped: false, summary };
    } catch (e: any) {
      const summary = {
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        error: e?.message ?? "Unknown error",
      };
      await supabase
        .from("missions")
        .update({
          iris_kickoff_status: "failed",
          iris_kickoff_summary: summary,
        })
        .eq("id", data.missionId);
      throw e;
    }
  });
