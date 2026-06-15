import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * On-demand health recalculation for one mission.
 * Called by the client hook on mount and on window focus.
 *
 * Authorization: caller must be (a) an admin, or (b) a mission team member.
 */
export const recalcMissionHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        missionId: z.string().uuid(),
        onlyStale: z.boolean().optional().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: isAdmin }, { data: teamRow }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase
        .from("mission_team_members")
        .select("member_id")
        .eq("mission_id", data.missionId)
        .eq("member_id", userId)
        .maybeSingle(),
    ]);
    if (!isAdmin && !teamRow) {
      throw new Error("Forbidden: you are not a member of this mission");
    }

    // Use admin client to bypass RLS during the recalc itself.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recalculateMissionHealth } = await import("./atlas-health.server");
    const result = await recalculateMissionHealth(supabaseAdmin, data.missionId, {
      onlyStale: data.onlyStale,
      limit: 500,
    });
    return result;
  });
