import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/ingest-intel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared-secret check via dedicated server-only cron secret.
        const provided =
          request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
        const expected = process.env.CRON_HOOK_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { ingestIndustryIntelligence } = await import("@/lib/intel-ingest.server");
          const result = await ingestIndustryIntelligence();
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("[ingest-intel] failed", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
