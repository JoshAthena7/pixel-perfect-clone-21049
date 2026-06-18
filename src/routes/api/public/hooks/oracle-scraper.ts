// Cron: every 4h ('0 */4 * * *'). Required env: CRON_HOOK_SECRET.
// Scrapes oracle_source_registry, enqueues new items into oracle_ingestion_queue.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/oracle-scraper")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;

        const { runScraper } = await import("@/lib/oracle/pipeline.server");
        const result = await runScraper();
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
