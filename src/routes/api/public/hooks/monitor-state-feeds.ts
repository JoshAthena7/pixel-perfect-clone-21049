// Cron: daily 08:00 EST (13:00 UTC). Required env: CRON_HOOK_SECRET, LOVABLE_API_KEY.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/monitor-state-feeds")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runFeedsForMission, getMissionContext } = await import("@/lib/monitoring/monitoring-utils.server");
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const { data: missions } = await supabaseAdmin
          .from("missions")
          .select("id,state")
          .eq("status", "active")
          .not("state", "is", null);

        const batch = (missions ?? []).slice(0, 10);
        let totalChecked = 0, totalCreated = 0;
        for (const m of batch) {
          const missionId = (m as { id: string }).id;
          try {
            const r = await runFeedsForMission(
              missionId,
              ["state_legislative", "state_agency_news"],
              supabaseAdmin,
              apiKey,
              48 * 60 * 60 * 1000,
            );
            totalChecked += r.checked;
            totalCreated += r.created;

            // Enrich graph nodes: append high-relevance item headlines as recent_mentions
            // on any stakeholder node whose label appears in a recent item headline.
            if (r.created > 0) {
              const ctx = await getMissionContext(missionId, supabaseAdmin);
              const programKw = ctx?.programType?.toLowerCase() ?? "";
              const { data: recentItems } = await supabaseAdmin
                .from("intelligence_feed_items")
                .select("headline,iris_relevance_score")
                .eq("mission_id", missionId)
                .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
              const hot = (recentItems ?? []).filter((it) => {
                const score = (it as { iris_relevance_score: number }).iris_relevance_score;
                const head = (it as { headline: string }).headline.toLowerCase();
                return score >= 60 && (!programKw || head.includes(programKw));
              });
              if (hot.length) {
                const { data: nodes } = await supabaseAdmin
                  .from("intelligence_graph_nodes")
                  .select("id,label,metadata")
                  .eq("mission_id", missionId)
                  .in("node_type", ["stakeholder", "evaluator"]);
                for (const node of nodes ?? []) {
                  const label = ((node as { label: string }).label ?? "").toLowerCase();
                  const matches = hot
                    .filter((h) => label && (h as { headline: string }).headline.toLowerCase().includes(label))
                    .map((h) => (h as { headline: string }).headline);
                  if (matches.length) {
                    const meta = ((node as { metadata: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
                    const prev = Array.isArray(meta.recent_mentions) ? meta.recent_mentions as string[] : [];
                    const merged = Array.from(new Set([...matches, ...prev])).slice(0, 20);
                    await supabaseAdmin
                      .from("intelligence_graph_nodes")
                      .update({ metadata: { ...meta, recent_mentions: merged } })
                      .eq("id", (node as { id: string }).id);
                  }
                }
              }
            }
          } catch (err) {
            console.error("monitor-state-feeds mission failed", missionId, err);
          }
        }

        const summary = `monitor-state-feeds: checked ${batch.length} missions, processed ${totalChecked} items, created ${totalCreated} feed items`;
        console.log(summary);
        return new Response(JSON.stringify({ ok: true, missions: batch.length, checked: totalChecked, created: totalCreated }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
