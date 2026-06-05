import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Flips a mission from Setup → Active. Validates required sections exist.
 * Returns the readiness summary so the caller can show "Mission Ready".
 */
export const launchMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ missionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId } = data;

    const [mission, members, timeline, questions] = await Promise.all([
      supabase.from("missions").select("id,name,client,submission_date,status").eq("id", missionId).maybeSingle(),
      supabase.from("mission_members").select("user_id").eq("mission_id", missionId),
      supabase.from("mission_timeline").select("submission").eq("mission_id", missionId).maybeSingle(),
      supabase.from("question_records").select("id", { count: "exact", head: true }).eq("mission_id", missionId),
    ]);

    if (!mission.data) throw new Error("Mission not found");
    const missingChecks: string[] = [];
    if (!mission.data.name || !mission.data.client) missingChecks.push("Mission Identity");
    if (!members.data || members.data.length === 0) missingChecks.push("Team Assignment");
    if (!timeline.data?.submission) missingChecks.push("Timeline & Gates");
    if (!questions.count || questions.count === 0) missingChecks.push("Question Setup");

    if (missingChecks.length > 0) {
      return { ok: false as const, missing: missingChecks };
    }

    const { error: updErr } = await supabase
      .from("missions")
      .update({ status: "Active" })
      .eq("id", missionId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true as const, missionId };
  });
