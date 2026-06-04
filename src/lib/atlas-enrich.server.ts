// Server-only enrichment for uploaded Atlas Sources:
// 1) one-sentence IRIS summary (if missing)
// 2) Gemini embedding stored on atlas_sources.embedding AND in the shared embeddings table
// 3) cross-match to active mission questions
//
// Used by upsertAtlasSource (fire-and-forget after insert) and by the
// /api/public/hooks/backfill-atlas-embeddings cron route.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { summarizeIntel, embed, matchIntelToMissions } from "./intel-enrich.server";

export async function enrichAtlasSource(row: {
  id: string;
  source_title: string;
  summary: string | null;
  source_raw_text?: string | null;
  mission_id?: string | null;
}) {
  const body = row.source_raw_text ?? row.summary ?? "";
  const summary = row.summary ?? (await summarizeIntel(row.source_title, body));
  const vector = await embed(`${row.source_title}\n\n${row.summary ?? body ?? ""}`);

  const update: {
    summary?: string;
    embedding?: unknown;
    related_rfp_questions?: string[];
    date_last_ingested?: string;
  } = {};
  if (summary && summary !== row.summary) update.summary = summary;

  if (vector) {
    update.embedding = vector as unknown;
    update.date_last_ingested = new Date().toISOString();

    // Mirror into the shared embeddings table for unified semantic search.
    await supabaseAdmin.from("embeddings").insert({
      source_table: "atlas_sources",
      source_id: row.id,
      mission_id: row.mission_id ?? null,
      content_text: `${row.source_title}\n${row.summary ?? body ?? ""}`.slice(0, 4000),
      embedding: vector as unknown as never,
    });

    // Cross-match to active mission questions.
    const { questionIds } = await matchIntelToMissions(vector);
    if (questionIds.length) update.related_rfp_questions = questionIds;
  }

  if (Object.keys(update).length) {
    await supabaseAdmin.from("atlas_sources").update(update).eq("id", row.id);
  }
}
