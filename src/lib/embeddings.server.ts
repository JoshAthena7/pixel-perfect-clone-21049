/**
 * Embeddings service — server-only.
 *
 * Uses Lovable AI Gateway's OpenAI-compatible /embeddings endpoint with
 * openai/text-embedding-3-small at 1536 dimensions to match the
 * vector(1536) columns on oracle_signals, oracle_knowledge_base, and
 * atlas_institutional_memory.
 *
 * IMPORTANT: this file MUST NOT be imported from browser code. The
 * `.server.ts` suffix blocks client bundles. Read LOVABLE_API_KEY inside
 * the call, not at module scope.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
const EMBEDDING_MODEL = "openai/text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
// 8000 chars is well within the 8191-token cap for this model.
const MAX_INPUT_CHARS = 8000;

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[embeddings] LOVABLE_API_KEY missing — skipping");
    return null;
  }
  const input = (text ?? "").trim();
  if (!input) return null;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "raw-fetch",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: input.slice(0, MAX_INPUT_CHARS),
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[embeddings] gateway ${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const vec = json.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMENSIONS) {
      console.warn("[embeddings] unexpected response shape");
      return null;
    }
    return vec;
  } catch (err) {
    console.warn("[embeddings] failed (non-fatal):", err);
    return null;
  }
}

/** pgvector accepts the literal `[1,2,3]` form when bound through PostgREST. */
export function toPgVector(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export function buildSignalEmbeddingText(signal: {
  title?: string | null;
  what_happened?: string | null;
  why_it_matters?: string | null;
  category?: string | null;
  topic_tags?: string[] | null;
}): string {
  return [
    signal.title,
    signal.category,
    signal.what_happened,
    signal.why_it_matters,
    signal.topic_tags?.join(" "),
  ]
    .filter(Boolean)
    .join(". ");
}

export function buildQueryEmbeddingText(questionText: string, winThemes?: string[]): string {
  return [questionText, winThemes?.join(" ")].filter(Boolean).join(". ");
}
