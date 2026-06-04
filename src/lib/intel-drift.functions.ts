// Intel Drift Recalibration — one-shot reset for a mission's Oracle + IRIS.
// Leadership-only. Marks current DNA as not-current, regenerates a fresh DNA
// from the latest RFP, wipes brief caches, supersedes prior mission-scoped
// IRIS memories (kept for audit), re-queues the full research question set
// through Perplexity, posts a Global Briefing to the mission team, and
// writes an Olympus audit-log entry.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export const recalibrateMissionIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        missionId: z.string().uuid(),
        reason: z.string().min(4).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) {
      throw new Error("Only leadership can declare an intel drift.");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { generateMissionDna } = await import("./iris-dna.functions");
    const { runOneTask } = await import("./iris-research.functions");

    const now = new Date().toISOString();

    // Mission context for the briefing
    const { data: mission } = await supabaseAdmin
      .from("missions")
      .select("id,name,client,state")
      .eq("id", data.missionId)
      .maybeSingle();
    if (!mission) throw new Error("Mission not found");

    // 1) Mark current DNA as not-current (generateMissionDna will insert a new
    //    versioned row and also flip is_current=false on the prior current row,
    //    but we do it up-front so the cache is invalidated even if generation fails).
    await supabaseAdmin
      .from("mission_intelligence_dna")
      .update({ is_current: false })
      .eq("mission_id", data.missionId)
      .eq("is_current", true);

    // 2) Wipe IRIS brief cache for this mission (mission/lobby briefs by ref_id,
    //    plus any question-scoped briefs whose ref_id is a question in this mission).
    const { data: questionIds } = await supabaseAdmin
      .from("question_records")
      .select("id")
      .eq("mission_id", data.missionId);
    const qIds = (questionIds ?? []).map((q: { id: string }) => q.id);
    const refIds = [data.missionId, ...qIds];
    const { data: deletedCache } = await supabaseAdmin
      .from("iris_brief_cache")
      .delete()
      .in("ref_id", refIds)
      .select("id");
    const cacheCleared = deletedCache?.length ?? 0;

    // 3) Supersede mission-scoped IRIS memories (auditable — not deleted).
    // Cast: superseded_at / superseded_reason were just added; types.ts
    // regenerates after this migration.
    const { data: supersededRows } = await (supabaseAdmin as any)
      .from("iris_memories")
      .update({
        superseded_at: now,
        superseded_reason: data.reason.slice(0, 2000),
      })
      .eq("mission_id", data.missionId)
      .is("superseded_at", null)
      .eq("scope", "mission")
      .select("id");
    const memoriesSuperseded = supersededRows?.length ?? 0;

    // 4) Regenerate DNA from the latest RFP in the Vault
    let dnaResult: { ok: true; questions: number } | { ok: false; error: string };
    let newDnaId: string | null = null;
    try {
      const res: any = await generateMissionDna({
        data: { missionId: data.missionId },
      });
      newDnaId = res?.dnaId ?? res?.id ?? null;
      dnaResult = { ok: true, questions: res?.questionsCount ?? 0 };
    } catch (e) {
      dnaResult = {
        ok: false,
        error: e instanceof Error ? e.message : "DNA generation failed",
      };
    }

    // 5) Re-queue & run all pending research tasks for this mission's current DNA
    let researched = 0;
    let researchFailed = 0;
    if (dnaResult.ok) {
      const { data: dnaRow } = await supabaseAdmin
        .from("mission_intelligence_dna")
        .select("id, dna")
        .eq("mission_id", data.missionId)
        .eq("is_current", true)
        .maybeSingle();

      if (dnaRow) {
        const { data: tasks } = await supabaseAdmin
          .from("research_tasks")
          .select("id, mission_id, question, why_it_matters, relevant_rfp_sections")
          .eq("mission_id", data.missionId)
          .eq("status", "pending")
          .order("priority", { ascending: true })
          .limit(20);

        for (const t of tasks ?? []) {
          const r = await runOneTask(
            supabaseAdmin,
            t as any,
            dnaRow.dna as any,
          );
          if (r.ok) researched++;
          else researchFailed++;
          await new Promise((res) => setTimeout(res, 600));
        }
      }
    }

    // 6) Post Global Briefing to the team
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("display_name,email")
      .eq("id", userId)
      .maybeSingle();
    const senderName =
      prof?.display_name?.trim() ||
      prof?.email?.split("@")[0] ||
      "Leadership";

    const missionLabel = [mission.name, mission.client, mission.state]
      .filter(Boolean)
      .join(" · ");

    await supabaseAdmin.from("briefings").insert({
      type: "global",
      sender_id: userId,
      sender_name: senderName,
      sender_role: "Leadership",
      recipient_id: null,
      subject: `Intel Drift Declared — ${mission.name ?? "Mission"} recalibrated`,
      body:
        `Leadership has declared an intel drift on ${missionLabel}. ` +
        `The Oracle and IRIS have been recalibrated as of ${new Date(now).toUTCString()}.\n\n` +
        `Reason: ${data.reason.trim()}\n\n` +
        `What changed:\n` +
        `• Mission Intelligence DNA regenerated from the latest RFP${dnaResult.ok ? "" : ` (failed: ${dnaResult.error})`}\n` +
        `• ${memoriesSuperseded ?? 0} mission-scoped IRIS memories superseded (kept for audit)\n` +
        `• ${cacheCleared ?? 0} cached briefs cleared\n` +
        `• ${researched} research questions re-run through Perplexity (${researchFailed} failed)\n\n` +
        `All Question Briefs, Mission Briefs, and Lobby Briefs will regenerate on next open. ` +
        `Please re-run Score Me on any question you've already drafted.`,
    });

    // 7) Audit log
    await supabaseAdmin.from("olympus_audit_log").insert({
      mission_id: data.missionId,
      action_type: "intel_drift_recalibration",
      action_summary:
        `Intel drift recalibration: DNA ${dnaResult.ok ? "regenerated" : "FAILED"}, ` +
        `${memoriesSuperseded ?? 0} memories superseded, ${cacheCleared ?? 0} briefs cleared, ` +
        `${researched} questions re-researched (${researchFailed} failed). Reason: ${data.reason.slice(0, 200)}`,
      target_table: "mission_intelligence_dna",
      user_id: userId,
    });

    return {
      ok: true,
      dna: dnaResult,
      newDnaId,
      memoriesSuperseded: memoriesSuperseded ?? 0,
      cacheCleared: cacheCleared ?? 0,
      researched,
      researchFailed,
      recalibratedAt: now,
    };
  });
