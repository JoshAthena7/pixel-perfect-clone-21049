// Cron: daily 06:00 EST (11:00 UTC). Required env: CRON_HOOK_SECRET, LOVABLE_API_KEY.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/monitor-cms-feeds")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runFeedsForMission } = await import("@/lib/monitoring/monitoring-utils.server");
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) return new Response("LOVABLE_API_KEY missing", { status: 500 });

        const { data: missions } = await supabaseAdmin
          .from("missions")
          .select("id")
          .eq("status", "active");

        const batch = (missions ?? []).slice(0, 10);
        let totalChecked = 0, totalCreated = 0;
        for (const m of batch) {
          try {
            const r = await runFeedsForMission(
              (m as { id: string }).id,
              ["cms_guidance", "federal_register"],
              supabaseAdmin,
              apiKey,
              48 * 60 * 60 * 1000,
            );
            totalChecked += r.checked;
            totalCreated += r.created;
          } catch (err) {
            console.error("monitor-cms-feeds mission failed", (m as { id: string }).id, err);
          }
        }

        const summary = `monitor-cms-feeds: checked ${batch.length} missions, processed ${totalChecked} items, created ${totalCreated} feed items`;
        console.log(summary);
        return new Response(JSON.stringify({ ok: true, missions: batch.length, checked: totalChecked, created: totalCreated }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
