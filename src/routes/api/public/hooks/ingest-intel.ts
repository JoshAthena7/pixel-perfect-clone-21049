import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/ingest-intel")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared-secret check via apikey header (matches pg_cron call).
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
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
