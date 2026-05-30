// Shared embedding helper for server-side intelligence routes.
// Uses OpenAI text-embedding-3-small (1536 dims) via raw fetch — works in the
// Cloudflare Worker runtime without pulling in the openai SDK.

export async function embedText(text: string, apiKey: string): Promise<number[] | null> {
  if (!text || !text.trim()) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text.slice(0, 8000) }),
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
