// Cron: every 30m ('*/30 * * * *'). Required env: CRON_HOOK_SECRET, LOVABLE_API_KEY.
// Classifies up to 20 pending oracle_ingestion_queue rows via Lovable AI Gateway.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/oracle-classifier")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { runClassifier } = await import("@/lib/oracle/pipeline.server");
        const result = await runClassifier();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
