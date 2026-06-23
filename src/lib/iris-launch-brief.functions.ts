import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { triggerMissionLaunchBrief } from "./iris-launch-brief.server";

const Input = z.object({ missionId: z.string().uuid() });

// Fire-and-forget trigger from client when mission launches.
// Always resolves OK; the actual work runs in the background.
// AUTH: requires a signed-in user with access to the mission — otherwise this
// endpoint would let any unauthenticated visitor kick off background AI work
// against any mission UUID and burn AI credits.
export const triggerLaunchBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Caller must be platform admin OR a member of the target mission. RLS
    // alone is not enough here because we use the result to gate AI work.
    const [{ data: member }, { data: isAdmin }] = await Promise.all([
      supabase
        .from("mission_team_members")
        .select("mission_id")
        .eq("mission_id", data.missionId)
        .eq("member_id", userId)
        .maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!member && !isAdmin) {
      throw new Error("Forbidden — you do not have access to this mission.");
    }

    try {
      triggerMissionLaunchBrief({ missionId: data.missionId });
    } catch (e) {
      console.error("[launch-brief] trigger failure", e);
    }
    return { ok: true };
  });

