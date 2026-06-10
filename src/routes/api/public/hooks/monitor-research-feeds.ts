// Cron: weekly Monday 09:00 EST (Mon 14:00 UTC). Required env: CRON_HOOK_SECRET, LOVABLE_API_KEY.
import { createFileRoute } from "@tanstack/react-router";

const COMMON_RESEARCH_FEEDS = [
  { url: "https://www.urban.org/rss.xml", name: "Urban Institute" },
  { url: "https://kff.org/feed/", name: "KFF" },
  { url: "https://www.healthaffairs.org/rss/journal", name: "Health Affairs" },
  { url: "https://www.commonwealthfund.org/rss.xml", name: "Commonwealth Fund" },
];

export const Route = createFileRoute("/api/public/hooks/monitor-research-feeds")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          getMissionContext,
          fetchRssFeed,
          assessRelevance,
          checkForDuplicate,
          createFeedItem,
          runFeedsForMission,
        } = await import("@/lib/monitoring/monitoring-utils.server");
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const SINCE = 8 * 24 * 60 * 60 * 1000;

        const { data: missions } = await supabaseAdmin
          .from("missions")
          .select("id")
          .eq("status", "active");

        const batch = (missions ?? []).slice(0, 10);
        let totalChecked = 0, totalCreated = 0;

        // Fetch the 4 common feeds once and reuse across missions.
        const commonItems = await Promise.all(
          COMMON_RESEARCH_FEEDS.map(async (f) => ({
            name: f.name,
            items: await fetchRssFeed(f.url),
          })),
        );
        const cutoff = Date.now() - SINCE;

        for (const m of batch) {
          const missionId = (m as { id: string }).id;
          try {
            const ctx = await getMissionContext(missionId, supabaseAdmin);
            if (!ctx) continue;

            // Get or create a synthetic feed_config to attach common items to.
            // We use the first configured research feed; if none exists we skip common items.
            const researchCfg = ctx.feedConfigs.find((c) => c.feed_type === "research_publications");

            // 1. Common research feeds → attach to researchCfg if present
            if (researchCfg) {
              for (const feed of commonItems) {
                for (const item of feed.items.filter((i) => {
                  if (!i.pubDate) return true;
                  const t = new Date(i.pubDate).getTime();
                  return Number.isFinite(t) ? t >= cutoff : true;
                }).slice(0, 15)) {
                  totalChecked += 1;
                  try {
                    if (await checkForDuplicate(missionId, item.link, supabaseAdmin)) continue;
                    const assessment = await assessRelevance(item, ctx, apiKey);
                    await new Promise((r) => setTimeout(r, 500));
                    if (!assessment.is_relevant) continue;
                    await createFeedItem(missionId, researchCfg.id, feed.name, item, assessment, supabaseAdmin);
                    totalCreated += 1;

                    // Link/create research graph nodes for relevance >= 50
                    if (assessment.relevance_score >= 50) {
                      const { data: existing } = await supabaseAdmin
                        .from("intelligence_graph_nodes")
                        .select("id,metadata")
                        .eq("mission_id", missionId)
                        .eq("node_type", "research")
                        .ilike("label", `%${item.title.slice(0, 40)}%`)
                        .limit(1)
                        .maybeSingle();
                      if (existing) {
                        await supabaseAdmin
                          .from("intelligence_graph_nodes")
                          .update({
                            description: item.description.slice(0, 500),
                            updated_at: new Date().toISOString(),
                          })
                          .eq("id", (existing as { id: string }).id);
                      } else {
                        await supabaseAdmin.from("intelligence_graph_nodes").insert({
                          mission_id: missionId,
                          node_type: "research",
                          label: item.title.slice(0, 200),
                          description: item.description.slice(0, 500),
                          source: feed.name,
                          confidence_level: "medium",
                          metadata: { source_url: item.link },
                        });
                      }
                    }
                  } catch (err) {
                    console.error("research item failed", err);
                  }
                }
              }
            }

            // 2. Per-mission research_publications configs (using shared helper)
            const r = await runFeedsForMission(
              missionId,
              ["research_publications"],
              supabaseAdmin,
              apiKey,
              SINCE,
            );
            totalChecked += r.checked;
            totalCreated += r.created;
          } catch (err) {
            console.error("monitor-research-feeds mission failed", missionId, err);
          }
        }

        const summary = `monitor-research-feeds: checked ${batch.length} missions, processed ${totalChecked} items, created ${totalCreated} feed items`;
        console.log(summary);
        return new Response(JSON.stringify({ ok: true, missions: batch.length, checked: totalChecked, created: totalCreated }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
