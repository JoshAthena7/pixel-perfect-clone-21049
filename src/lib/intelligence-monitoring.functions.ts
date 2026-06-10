// Manually-triggered intelligence check for a single mission. Auth required.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const runIntelligenceCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ items_checked: number; items_created: number; feeds_checked: number }> => {
    // Authorization: caller must be admin OR a mission team member.
    const { data: isAdmin } = await context.supabase
      .rpc("has_role", { _user_id: context.userId, _role: "admin" as never });
    if (!isAdmin) {
      const { data: member } = await context.supabase
        .from("mission_team_members")
        .select("id")
        .eq("mission_id", data.missionId)
        .eq("member_id", context.userId)
        .maybeSingle();
      if (!member) throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runFeedsForMission } = await import("@/lib/monitoring/monitoring-utils.server");
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");

    let feeds = 0, checked = 0, created = 0;
    for (const types of [
      ["cms_guidance", "federal_register"],
      ["state_legislative", "state_agency_news"],
      ["research_publications"],
      ["custom"],
    ] as const) {
      try {
        const r = await runFeedsForMission(
          data.missionId,
          [...types],
          supabaseAdmin,
          apiKey,
          48 * 60 * 60 * 1000,
        );
        feeds += r.feeds;
        checked += r.checked;
        created += r.created;
      } catch (err) {
        console.error("runIntelligenceCheck batch failed", types, err);
      }
    }
    return { items_checked: checked, items_created: created, feeds_checked: feeds };
  });
