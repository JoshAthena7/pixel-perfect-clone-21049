import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  missionId: z.string().uuid(),
  conflictId: z.string().uuid(),
});

/**
 * Shared conflict-resolution server function used by Briefing Room
 * Risks section and Mission Activity timeline.
 *
 * - Fetches the conflict first; no-ops if already resolved
 * - Updates conflict_flags.resolved = true / resolved_at = now()
 * - Posts an IRIS message to both affected question threads in parallel
 *
 * Returns { success: boolean, error?: string, alreadyResolved?: boolean }.
 */
export const resolveConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Authorize: admin OR engagement_lead/lead on this mission.
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    let allowed = !!isAdmin;
    if (!allowed) {
      const { data: team } = await supabase
        .from("mission_team_members")
        .select("member_id,mission_role")
        .eq("mission_id", data.missionId)
        .in("mission_role", ["engagement_lead", "lead"]);
      const memberIds = (team ?? []).map((t: any) => t.member_id);
      if (memberIds.length) {
        const { data: me } = await supabase
          .from("atlas_team_members")
          .select("id")
          .in("id", memberIds)
          .eq("user_id", userId)
          .maybeSingle();
        allowed = !!me;
      }
    }
    if (!allowed) return { success: false, error: "Forbidden" };

    // Step A — load the conflict; bail if missing or already resolved.
    const { data: conflict, error: fetchErr } = await supabase
      .from("conflict_flags")
      .select("id,question_id_a,question_id_b,conflict_description,resolved")
      .eq("id", data.conflictId)
      .eq("mission_id", data.missionId)
      .maybeSingle();
    if (fetchErr) return { success: false, error: fetchErr.message };
    if (!conflict)
      return { success: false, error: "Conflict not found or already resolved" };
    if (conflict.resolved)
      return { success: false, error: "Conflict not found or already resolved", alreadyResolved: true };

    // Resolver display name.
    const { data: me } = await supabase
      .from("atlas_team_members")
      .select("display_name,full_name,email")
      .eq("user_id", userId)
      .maybeSingle();
    const resolverName =
      me?.display_name || me?.full_name || me?.email || "an Engagement Lead";

    // Step B — flip resolved.
    const { error: updateErr } = await supabase
      .from("conflict_flags")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", data.conflictId);
    if (updateErr) return { success: false, error: updateErr.message };

    // Step C — post IRIS message into both affected question threads in parallel.
    const body = `The decision conflict flagged on this section has been marked resolved by ${resolverName}. Proceed with the aligned approach. If you have questions about the resolution contact your Engagement Lead.`;
    const qids = [conflict.question_id_a, conflict.question_id_b].filter(
      Boolean,
    ) as string[];
    await Promise.all(
      qids.map((qid) =>
        supabase
          .from("thread_messages")
          .insert({
            mission_id: data.missionId,
            question_id: qid,
            sender_id: null,
            sender_name: "IRIS",
            message_type: "iris",
            message_body: body,
            created_at: new Date().toISOString(),
          })
          .then(
            () => undefined,
            (e: any) => console.error("[resolveConflict] thread post failed", qid, e),
          ),
      ),
    );

    return { success: true, resolverName };
  });
