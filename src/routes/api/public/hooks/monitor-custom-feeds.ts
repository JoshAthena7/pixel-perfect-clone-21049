// Cron: daily 10:00 EST (15:00 UTC). Required env: CRON_HOOK_SECRET, LOVABLE_API_KEY.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/monitor-custom-feeds")({
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

        const { data: configs } = await supabaseAdmin
          .from("intelligence_feed_configs")
          .select("mission_id")
          .eq("feed_type", "custom")
          .eq("is_active", true);

        const missionIds = Array.from(new Set((configs ?? []).map((c) => (c as { mission_id: string }).mission_id)));
        const batch = missionIds.slice(0, 10);
        let totalChecked = 0, totalCreated = 0;

        for (const missionId of batch) {
          try {
            const r = await runFeedsForMission(
              missionId,
              ["custom"],
              supabaseAdmin,
              apiKey,
              48 * 60 * 60 * 1000,
            );
            totalChecked += r.checked;
            totalCreated += r.created;
          } catch (err) {
            console.error("monitor-custom-feeds mission failed", missionId, err);
          }
        }

        const summary = `monitor-custom-feeds: checked ${batch.length} missions, processed ${totalChecked} items, created ${totalCreated} feed items`;
        console.log(summary);
        return new Response(JSON.stringify({ ok: true, missions: batch.length, checked: totalChecked, created: totalCreated }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
