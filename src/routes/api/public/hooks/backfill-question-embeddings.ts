import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backfill-question-embeddings")({
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
          const { ensureQuestionEmbedding } = await import("@/lib/intel-enrich.server");

          const { data: questions } = await supabaseAdmin
            .from("question_records")
            .select("id,mission_id,title,question_text")
            .limit(500);

          let done = 0;
          for (const q of questions ?? []) {
            try {
              await ensureQuestionEmbedding(q);
              done++;
            } catch (e) {
              console.warn("[backfill-q-emb] failed", q.id, e);
            }
          }
          return Response.json({ ok: true, processed: done, total: questions?.length ?? 0 });
        } catch (e) {
          console.error("[backfill-q-emb] failed", e);
          return Response.json({ ok: false, error: String(e) }, { status: 500 });
        }
      },
    },
  },
});
