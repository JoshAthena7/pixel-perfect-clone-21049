/**
 * Perplexity helper — grounded web search with citations.
 *
 * Server-only. Reads PERPLEXITY_API_KEY (injected by the Perplexity connector).
 * Returns null on any failure so callers can fall back gracefully.
 *
 * Use for: grounded research, academic-mode queries, SEC filings, deep
 * research synthesis. For general scraping/monitoring, use Firecrawl.
 * For app-internal LLM work, use the Lovable AI Gateway.
 */

export type PerplexityModel =
  | "sonar"
  | "sonar-pro"
  | "sonar-reasoning"
  | "sonar-reasoning-pro"
  | "sonar-deep-research";

export type PerplexitySearchMode = "web" | "academic" | "sec";

export type PerplexityAskOptions = {
  model?: PerplexityModel;
  system?: string;
  searchMode?: PerplexitySearchMode;
  recencyFilter?: "day" | "week" | "month" | "year";
  domainFilter?: string[];
  maxTokens?: number;
  temperature?: number;
};

export type PerplexityAnswer = {
  content: string;
  citations: string[];
  model: string;
};

export async function askPerplexity(
  query: string,
  opts: PerplexityAskOptions = {},
): Promise<PerplexityAnswer | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.log("[perplexity] PERPLEXITY_API_KEY missing");
    return null;
  }

  const body: Record<string, unknown> = {
    model: opts.model ?? "sonar",
    messages: [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content: query },
    ],
    temperature: opts.temperature ?? 0.2,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  if (opts.searchMode && opts.searchMode !== "web") body.search_mode = opts.searchMode;
  if (opts.recencyFilter) body.search_recency_filter = opts.recencyFilter;
  if (opts.domainFilter && opts.domainFilter.length > 0) {
    body.search_domain_filter = opts.domainFilter;
  }

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.log("[perplexity] non-ok", res.status, await res.text().catch(() => ""));
      return null;
    }
    const j = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    return {
      content: j.choices?.[0]?.message?.content ?? "",
      citations: Array.isArray(j.citations) ? j.citations : [],
      model: j.model ?? (body.model as string),
    };
  } catch (e) {
    console.log("[perplexity] threw", e);
    return null;
  }
}

/** Raw search API — returns ranked results without LLM synthesis. */
export async function searchPerplexity(query: string): Promise<
  Array<{ url: string; title?: string; snippet?: string }> | null
> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.perplexity.ai/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      console.log("[perplexity] search non-ok", res.status);
      return null;
    }
    const j = (await res.json()) as { results?: Array<{ url: string; title?: string; snippet?: string }> };
    return j.results ?? [];
  } catch (e) {
    console.log("[perplexity] search threw", e);
    return null;
  }
}
