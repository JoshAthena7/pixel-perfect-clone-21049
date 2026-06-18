// Cron: every 30m offset +15 ('15,45 * * * *'). Required env: CRON_HOOK_SECRET.
// Promotes classified items (score >= 30) from oracle_ingestion_queue into oracle_signals.
// Items scoring >=85 with urgency immediate/high also write intel_events alerts.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/oracle-promoter")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { runPromoter } = await import("@/lib/oracle/pipeline.server");
        const result = await runPromoter();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
