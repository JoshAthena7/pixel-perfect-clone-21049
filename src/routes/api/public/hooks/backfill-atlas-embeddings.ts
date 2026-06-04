import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backfill-atlas-embeddings")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
        const expected = process.env.CRON_HOOK_SECRET;
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { enrichAtlasSource } = await import("@/lib/atlas-enrich.server");

          const { data: rows } = await supabaseAdmin
            .from("atlas_sources")
            .select("id,source_title,summary,source_raw_text,mission_id")
            .is("embedding", null)
            .limit(100);

          let done = 0;
          for (const r of rows ?? []) {
            try {
              await enrichAtlasSource(r as any);
              done++;
            } catch (e) {
              console.warn("[backfill-atlas-emb] failed", (r as any).id, e);
            }
          }
          return Response.json({ ok: true, processed: done, total: rows?.length ?? 0 });
        } catch (e) {
          console.error("[backfill-atlas-emb] failed", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
