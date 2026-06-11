// Server-fn wrappers for the territory + RFP-requirement graph seeders.
// Thin auth shells over helpers in iris-territory.server.ts so the
// wizard, BLAST OFF, and Oracle tab can fire them client-side.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMissionAccess(supabase: any, userId: string, missionId: string): Promise<void> {
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" as never });
  if (isAdmin) return;
  const { data: member } = await supabase
    .from("mission_team_members")
    .select("id")
    .eq("mission_id", missionId)
    .eq("member_id", userId)
    .maybeSingle();
  if (!member) throw new Error("Forbidden");
}

export const seedTerritoryIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ seeded: number; edges: number; skipped: boolean }> => {
    await assertMissionAccess(context.supabase, context.userId, data.missionId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { seedTerritoryForMission } = await import("@/lib/iris-territory.server");
    try {
      return await seedTerritoryForMission(data.missionId, supabaseAdmin, apiKey);
    } catch (e) {
      console.error("[seedTerritoryIntelligence] failed", e);
      return { seeded: 0, edges: 0, skipped: false };
    }
  });

export const extractRequirementNodesFromRFP = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ created: number; edges: number }> => {
    await assertMissionAccess(context.supabase, context.userId, data.missionId);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { extractRequirementNodesForMission } = await import("@/lib/iris-territory.server");
    try {
      return await extractRequirementNodesForMission(data.missionId, supabaseAdmin, apiKey);
    } catch (e) {
      console.error("[extractRequirementNodesFromRFP] failed", e);
      return { created: 0, edges: 0 };
    }
  });
