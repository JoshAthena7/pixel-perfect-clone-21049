// Backfill route: embed every research_results row that doesn't yet have an
// embedding, and mirror it into the unified embeddings table so the IRIS
// retriever can pull Perplexity answers via semantic search.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backfill-research-embeddings")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const provided =
    request.headers.get("x-cron-secret") ?? request.headers.get("apikey");
  const expected = process.env.CRON_HOOK_SECRET;
  if (!expected || !provided || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { embed, storeEmbedding } = await import("@/lib/intel-enrich.server");

  const limit = 20;
  const { data: pending, error } = await supabaseAdmin
    .from("research_results")
    .select("id, mission_id, answer, task_id, research_tasks(question)")
    .is("embedding", null)
    .order("generated_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[backfill-research-embeddings] query failed", error);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; ok: boolean }> = [];
  for (const row of pending ?? []) {
    try {
      const question = (row as any).research_tasks?.question ?? "";
      const text = `[Perplexity research]\nQuestion: ${question}\n\nAnswer: ${row.answer}`.slice(0, 6000);
      const vec = await embed(text);
      if (!vec) {
        results.push({ id: row.id, ok: false });
        continue;
      }
      await supabaseAdmin
        .from("research_results")
        .update({ embedding: vec as unknown as never })
        .eq("id", row.id);
      await storeEmbedding({
        source_table: "research_results",
        source_id: row.id,
        mission_id: row.mission_id,
        content_text: text,
        vector: vec,
        scope: "mission",
      });
      results.push({ id: row.id, ok: true });
    } catch (e) {
      console.error("[backfill-research-embeddings] row failed", row.id, e);
      results.push({ id: row.id, ok: false });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: results.length }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
