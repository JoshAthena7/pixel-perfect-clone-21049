// Backfill route: embed every research_results row that doesn't yet have an
// embedding, and mirror it into the unified embeddings table so the IRIS
// retriever can pull Perplexity answers via semantic search.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/backfill-research-embeddings")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

async function handle(_request: Request) {
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
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const row of pending ?? []) {
    try {
      const question = (row as any).research_tasks?.question ?? "";
      const text = `[Perplexity research]\nQuestion: ${question}\n\nAnswer: ${row.answer}`.slice(0, 6000);
      const vec = await embed(text);
      if (!vec) {
        results.push({ id: row.id, ok: false, error: "embed returned null" });
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
    } catch (e: any) {
      results.push({ id: row.id, ok: false, error: e?.message ?? String(e) });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: results.length, results }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
