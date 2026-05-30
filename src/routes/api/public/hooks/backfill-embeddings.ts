// /api/public/hooks/backfill-embeddings
// One-shot backfill — enqueues existing rows from all 8 source tables.

import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

const SOURCES: Array<{ table: string; fields: string[]; engagementCol: string }> = [
  { table: "heatmap_sections", fields: ["section_name", "notes", "instructions"], engagementCol: "engagement_id" },
  { table: "decisions", fields: ["title", "rationale", "impacted_areas"], engagementCol: "engagement_id" },
  { table: "huddles", fields: ["priority", "risk", "notes", "writer_concern", "client_concern"], engagementCol: "engagement_id" },
  { table: "sos_alerts", fields: ["category", "description", "recommended_action"], engagementCol: "engagement_id" },
  { table: "intel_documents", fields: ["name", "category", "notes"], engagementCol: "engagement_id" },
  { table: "win_themes", fields: ["title", "description"], engagementCol: "engagement_id" },
  { table: "risks", fields: ["title", "description"], engagementCol: "engagement_id" },
  { table: "client_pulses", fields: ["sentiment", "summary", "action_items"], engagementCol: "engagement_id" },
];

export const Route = createFileRoute("/api/public/hooks/backfill-embeddings")({
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

  const summary: Record<string, number> = {};

  for (const src of SOURCES) {
    const cols = ["id", src.engagementCol, ...src.fields].join(",");
    const { data, error } = await supabase.from(src.table).select(cols).limit(2000);
    if (error || !data) {
      summary[src.table] = -1;
      continue;
    }
    const rows = (data as any[])
      .map((r) => {
        const content = src.fields.map((f) => r[f] ?? "").join(" ").trim();
        if (!content) return null;
        return {
          source_table: src.table,
          source_id: r.id,
          engagement_id: r[src.engagementCol] ?? null,
          content_text: content,
          priority: 1,
        };
      })
      .filter(Boolean);

    if (rows.length === 0) {
      summary[src.table] = 0;
      continue;
    }
    const { error: upErr } = await supabase
      .from("embedding_queue")
      .upsert(rows as any[], { onConflict: "source_table,source_id" });
    summary[src.table] = upErr ? -1 : rows.length;
  }

  return Response.json({ enqueued: summary });
}
