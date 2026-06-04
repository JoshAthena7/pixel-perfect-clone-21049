// Server-only helpers for IRIS summarization, embeddings, and cross-mission matching
import { withPersonFirst } from "./person-first";
// of market_intelligence items. Used by both the manual ingestion server fn and the
// pg_cron-triggered /api/public/hooks/ingest-intel route.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertNoPHI } from "@/lib/phi-detection";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const EMBED_DIM = 1536; // existing embeddings.embedding column is vector(1536)
const SIMILARITY_THRESHOLD = 0.75;

function key() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("LOVABLE_API_KEY missing");
  return k;
}

export async function summarizeIntel(title: string, body: string | null): Promise<string | null> {
  try {
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: withPersonFirst(
              "You are IRIS, a senior Medicaid/Medicare proposal strategist. Summarize the following intelligence item in ONE sentence (max 30 words). Be specific, concrete, no hedging.",
            ),
          },
          { role: "user", content: `TITLE: ${title}\n\n${(body ?? "").slice(0, 4000)}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return j.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function embed(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${GATEWAY}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-embedding-001",
        input: text.slice(0, 6000),
        dimensions: EMBED_DIM,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    return j.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/** Store an embedding row in the shared embeddings table.
 *  H4: scope is REQUIRED and isolates rows from cross-tenant reads via RLS.
 *  - "mission"      → only mission members + admins
 *  - "global"       → all authenticated users (e.g. published market intel, canon)
 *  - "unclassified" → admin-only (fallback; do not use for new code paths) */
export async function storeEmbedding(args: {
  source_table: string;
  source_id: string;
  mission_id: string | null;
  content_text: string;
  vector: number[];
  scope: "mission" | "global" | "unclassified";
}) {
  await supabaseAdmin.from("embeddings").insert({
    source_table: args.source_table,
    source_id: args.source_id,
    mission_id: args.mission_id,
    content_text: args.content_text.slice(0, 4000),
    embedding: args.vector as unknown as never,
    scope: args.scope,
  } as never);
}

/** Match an intel embedding to active mission questions via cosine similarity. */
export async function matchIntelToMissions(vector: number[]): Promise<{
  missionIds: string[];
  questionIds: string[];
}> {
  const { data, error } = await supabaseAdmin.rpc("match_intel_to_questions", {
    query_embedding: vector as unknown as never,
    similarity_threshold: SIMILARITY_THRESHOLD,
    max_questions: 30,
  });
  if (error || !data) return { missionIds: [], questionIds: [] };
  const missions = new Set<string>();
  const questions = new Set<string>();
  for (const row of data as Array<{ mission_id: string; question_id: string }>) {
    if (row.mission_id) missions.add(row.mission_id);
    if (row.question_id) questions.add(row.question_id);
  }
  return { missionIds: [...missions], questionIds: [...questions] };
}

/** Enrich a freshly-inserted industry intel row: summary + embedding + cross-match. */
export async function enrichIntelRow(row: {
  id: string;
  title: string;
  summary: string | null;
  source: string | null;
}) {
  const summary = row.summary ?? (await summarizeIntel(row.title, row.summary));
  const vector = await embed(`${row.title}\n\n${row.summary ?? ""}`);

  const update: {
    summary?: string;
    matched_mission_ids?: string[];
    question_ids?: string[];
    is_cross_referenced?: boolean;
  } = {};
  if (summary && summary !== row.summary) update.summary = summary;

  if (vector) {
    await storeEmbedding({
      source_table: "market_intelligence",
      source_id: row.id,
      mission_id: null,
      content_text: `${row.title}\n${row.summary ?? ""}`,
      vector,
      // H4: published industry intel is intentionally cross-tenant.
      scope: "global",
    });
    const { missionIds, questionIds } = await matchIntelToMissions(vector);
    if (missionIds.length) {
      update.matched_mission_ids = missionIds;
      update.question_ids = questionIds;
      update.is_cross_referenced = true;
    }
  }

  if (Object.keys(update).length) {
    await supabaseAdmin.from("market_intelligence").update(update).eq("id", row.id);
  }
}

/** Ensure a question_records row has an embedding stored. Called on demand. */
export async function ensureQuestionEmbedding(q: {
  id: string;
  mission_id: string;
  title: string;
  question_text: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("embeddings")
    .select("id")
    .eq("source_table", "question_records")
    .eq("source_id", q.id)
    .maybeSingle();
  if (existing) return;
  const text = `${q.title}\n\n${q.question_text}`;
  const v = await embed(text);
  if (!v) return;
  await storeEmbedding({
    source_table: "question_records",
    source_id: q.id,
    mission_id: q.mission_id,
    content_text: text,
    vector: v,
    // H4: question text is mission-scoped.
    scope: "mission",
  });
}
