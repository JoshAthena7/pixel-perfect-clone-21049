// Refresh monitoring feeds for a mission across all feed types.
// Designed to populate empty Oracle feed/stakeholder/competitor signals on demand.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALL_FEED_TYPES = [
  "state_legislative",
  "state_agency_news",
  "cms_official",
  "cms_federal_register",
  "research_pubmed",
  "research_health_affairs",
  "custom",
];

export const refreshAllMissionFeeds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");

    const { runFeedsForMission } = await import("@/lib/monitoring/monitoring-utils.server");
    const r = await runFeedsForMission(
      data.missionId,
      ALL_FEED_TYPES,
      supabase,
      apiKey,
      7 * 24 * 60 * 60 * 1000, // last 7 days
    );
    return r;
  });
