// Refresh ALL intelligence for a mission: rebuild graph + run all monitoring feeds.
// Designed to populate empty Oracle sub-tabs on demand.
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

export const refreshAllMissionIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const missionId = data.missionId;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("IRIS is not configured.");

    const results: {
      graph: { created: number; edges: number; completeness: number } | null;
      feeds: { feeds: number; checked: number; created: number };
      errors: string[];
    } = {
      graph: null,
      feeds: { feeds: 0, checked: 0, created: 0 },
      errors: [],
    };

    // 1) Rebuild graph (force)
    try {
      const { buildIntelligenceGraph } = await import("@/lib/oracle.functions");
      // Call the underlying handler logic via server fn invocation (re-uses same auth ctx)
      const r = await buildIntelligenceGraph({ data: { missionId, force: true } });
      results.graph = r;
    } catch (e) {
      results.errors.push(`graph: ${(e as Error).message}`);
    }

    // 2) Run all feed types for this mission
    try {
      const { runFeedsForMission } = await import("@/lib/monitoring/monitoring-utils.server");
      const r = await runFeedsForMission(
        missionId,
        ALL_FEED_TYPES,
        supabase,
        apiKey,
        7 * 24 * 60 * 60 * 1000, // last 7 days
      );
      results.feeds = r;
    } catch (e) {
      results.errors.push(`feeds: ${(e as Error).message}`);
    }

    return results;
  });
