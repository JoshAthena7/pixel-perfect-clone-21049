// Shared embedding helper for server-side intelligence routes.
//
// Uses OpenAI `text-embedding-3-large` with an explicit `dimensions: 1536`
// parameter so vectors stay schema-compatible with the existing
// `vector(1536)` columns and their ivfflat indexes (pgvector caps indexed
// vectors at 2000 dims). Quality is meaningfully better than
// text-embedding-3-small at the same dimension count.
//
// If we ever want full 3072-dim vectors we'd need to: drop the ivfflat
// indexes, ALTER the embedding columns to vector(3072), recreate the
// search RPCs with vector(3072) params, and either skip indexing or
// migrate to halfvec + hnsw.

export const EMBEDDING_MODEL = "text-embedding-3-large";
export const EMBEDDING_DIMS = 1536;

export async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMS,
        input: text.slice(0, 8000),
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("embed failed", res.status, t.slice(0, 200));
      return null;
    }
    const json: any = await res.json();
    return json?.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("embed error", e);
    return null;
  }
}

export function pgvectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
