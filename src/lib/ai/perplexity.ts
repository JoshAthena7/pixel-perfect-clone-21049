// Perplexity API helpers. Server-only.
//
// Three entry points:
//   searchWeb(prompt)    — sonar online model, fast live web search
//   searchDeep(prompt)   — sonar-pro, deeper reasoning + more citations
//   searchPeople(prompt) — sonar-pro with people_search tool (reserved)
//
// All three swallow errors and return a safe fallback shape so callers
// never have to throw / catch.
//
// Also exports a simple in-memory hourly cost guard so we never accidentally
// loop into a runaway bill.

const ENDPOINT = "https://api.perplexity.ai/chat/completions";

const SYSTEM_PROMPT =
  "You are an expert healthcare policy and government contracting analyst specializing in Medicaid, Medicare, managed care, LTSS, HCBS, and government procurement. Be concise, specific, and always cite your sources.";

export type PerplexityResult = { text: string; citations: string[] };

const FALLBACK: PerplexityResult = { text: "Live search temporarily unavailable.", citations: [] };

// ---------- Hourly cost guard ----------

const HOUR_MS = 60 * 60 * 1000;
const LIMITS = { web: 200, deep: 20, people: 50 } as const;
type GuardBucket = "web" | "deep" | "people";

const counters: Record<GuardBucket, { count: number; windowStart: number }> = {
  web: { count: 0, windowStart: Date.now() },
  deep: { count: 0, windowStart: Date.now() },
  people: { count: 0, windowStart: Date.now() },
};

/** Returns true if a call is allowed; increments the counter when allowed. */
export function checkPerplexityBudget(bucket: GuardBucket): boolean {
  const c = counters[bucket];
  const now = Date.now();
  if (now - c.windowStart > HOUR_MS) {
    c.count = 0;
    c.windowStart = now;
  }
  if (c.count >= LIMITS[bucket]) {
    console.warn(`[perplexity] hourly cap hit for ${bucket} (${LIMITS[bucket]}/hr) — falling back`);
    return false;
  }
  c.count += 1;
  return true;
}

// ---------- Core call ----------

type CallOpts = {
  model: string;
  prompt: string;
  tools?: Array<Record<string, unknown>>;
};

async function callPerplexity({ model, prompt, tools }: CallOpts): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error("[perplexity] PERPLEXITY_API_KEY not configured");
    return FALLBACK;
  }
  try {
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      return_citations: true,
      return_images: false,
      temperature: 0.2,
    };
    if (tools) body.tools = tools;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[perplexity] ${model} ${res.status}: ${txt.slice(0, 240)}`);
      return FALLBACK;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const citations = Array.isArray(json.citations) ? json.citations.filter((c) => typeof c === "string") : [];
    return { text, citations };
  } catch (e) {
    console.error("[perplexity] request failed", e);
    return FALLBACK;
  }
}

// ---------- Public API ----------

export async function searchWeb(prompt: string): Promise<PerplexityResult> {
  if (!checkPerplexityBudget("web")) return FALLBACK;
  return callPerplexity({ model: "llama-3.1-sonar-large-128k-online", prompt });
}

export async function searchDeep(prompt: string): Promise<PerplexityResult> {
  if (!checkPerplexityBudget("deep")) return FALLBACK;
  return callPerplexity({ model: "sonar-pro", prompt });
}

export async function searchPeople(prompt: string): Promise<PerplexityResult> {
  if (!checkPerplexityBudget("people")) return FALLBACK;
  return callPerplexity({
    model: "sonar-pro",
    prompt,
    tools: [{ type: "people_search" }],
  });
}
