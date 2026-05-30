// /api/public/hooks/process-embeddings
// Cron-driven. Drains embedding_queue in small batches.

import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { embedText, pgvectorLiteral } from "@/lib/intelligence/embed";

export const Route = createFileRoute("/api/public/hooks/process-embeddings")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return Response.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });
  }

  const { data: queue, error } = await supabase
    .from("embedding_queue")
    .select("*")
    .is("processed_at", null)
    .lt("attempts", 3)
    .order("priority", { ascending: false })
    .order("queued_at", { ascending: true })
    .limit(20);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let failed = 0;

  for (const row of queue ?? []) {
    const vec = await embedText(row.content_text, openaiKey);
    if (!vec) {
      failed++;
      const attempts = (row.attempts ?? 0) + 1;
      await supabase
        .from("embedding_queue")
        .update({ attempts, last_error: "embedding failed" })
        .eq("id", row.id);
      if (attempts >= 3 && row.engagement_id) {
        await supabase.from("activity_log").insert({
          engagement_id: row.engagement_id,
          user_id: null,
          actor_name: "Athena",
          action: "embedding_failed",
          target_table: row.source_table,
          target_id: row.source_id,
          metadata: { error: "max attempts exceeded" },
        });
      }
      await new Promise((r) => setTimeout(r, 150));
      continue;
    }

    const literal = pgvectorLiteral(vec);
    const { error: upErr } = await supabase.from("embeddings").upsert(
      {
        engagement_id: row.engagement_id,
        source_table: row.source_table,
        source_id: row.source_id,
        content_text: row.content_text,
        embedding: literal as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_table,source_id" },
    );

    if (upErr) {
      failed++;
      await supabase
        .from("embedding_queue")
        .update({ attempts: (row.attempts ?? 0) + 1, last_error: upErr.message })
        .eq("id", row.id);
    } else {
      processed++;
      await supabase
        .from("embedding_queue")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  const { count: remaining } = await supabase
    .from("embedding_queue")
    .select("id", { count: "exact", head: true })
    .is("processed_at", null);

  return Response.json({ processed, failed, remaining: remaining ?? 0 });
}
