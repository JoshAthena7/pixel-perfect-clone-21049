import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  missionId: z.string().uuid(),
  text: z.string().trim().min(1).max(50_000),
});

type Candidate = { name: string; url: string; description?: string };

async function extractCandidates(text: string): Promise<Candidate[]> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const system = `You extract a list of websites/sources to monitor from messy free text.
For each source produce JSON: { "name": short label (≤80 chars), "url": full https URL, "description": one short sentence }.
Rules:
- Only include real URLs. If the user gives a name without a URL, skip it.
- Normalize URLs to include the scheme (https://...).
- Deduplicate by URL.
- Return STRICT JSON: { "sources": [...] }. No prose outside JSON.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: text.slice(0, 40_000) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = m ? JSON.parse(m[0]) : { sources: [] };
  }
  const list: Candidate[] = Array.isArray(parsed.sources) ? parsed.sources : [];
  const seen = new Set<string>();
  return list
    .map((c) => ({
      name: String(c?.name ?? "").trim().slice(0, 120),
      url: String(c?.url ?? "").trim(),
      description: c?.description ? String(c.description).slice(0, 300) : undefined,
    }))
    .filter((c) => {
      if (!c.url || !/^https?:\/\//i.test(c.url)) return false;
      if (seen.has(c.url)) return false;
      seen.add(c.url);
      if (!c.name) c.name = new URL(c.url).hostname;
      return true;
    })
    .slice(0, 50);
}

// Try to discover an RSS/Atom feed URL from a page. Returns the feed URL or null.
async function detectRssFeed(pageUrl: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(pageUrl, {
      signal: ctrl.signal,
      headers: { "User-Agent": "IRIS-FeedDetector/1.0" },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    // Already a feed
    if (/(application|text)\/(rss|atom|xml)/i.test(ct)) return pageUrl;
    const html = (await res.text()).slice(0, 200_000);
    if (/^\s*<\?xml/i.test(html) && /<(rss|feed)\b/i.test(html)) return pageUrl;
    const linkRe =
      /<link[^>]+rel=["']?alternate["']?[^>]*type=["'](?:application|text)\/(?:rss|atom)\+xml["'][^>]*>/gi;
    const matches = html.match(linkRe);
    if (matches?.length) {
      for (const tag of matches) {
        const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
        if (href) return new URL(href, pageUrl).toString();
      }
    }
    // Also handle reversed attr order
    const linkRe2 =
      /<link[^>]+type=["'](?:application|text)\/(?:rss|atom)\+xml["'][^>]*rel=["']?alternate["']?[^>]*>/gi;
    const m2 = html.match(linkRe2);
    if (m2?.length) {
      const href = m2[0].match(/href=["']([^"']+)["']/i)?.[1];
      if (href) return new URL(href, pageUrl).toString();
    }
    return null;
  } catch {
    return null;
  }
}

export const bulkAddFeedsFromText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context as any;
    const candidates = await extractCandidates(data.text);
    type ResolvedFeed = { name: string; url: string; description: string; isRss: boolean; original: string };
    if (candidates.length === 0) return { inserted: 0, skipped: 0, feeds: [] as ResolvedFeed[] };

    // Existing URLs to avoid duplicates
    const { data: existing } = await supabase
      .from("intelligence_feed_configs")
      .select("feed_url")
      .eq("mission_id", data.missionId);
    const existingUrls = new Set(
      ((existing ?? []) as Array<{ feed_url: string | null }>).map((r) => r.feed_url).filter(Boolean) as string[],
    );

    const resolved = await Promise.all(
      candidates.map(async (c) => {
        const rss = await detectRssFeed(c.url);
        return {
          name: c.name,
          url: rss ?? c.url,
          description: c.description ?? (rss ? "Auto-detected RSS feed" : "Page-scrape monitor (no RSS detected)"),
          isRss: !!rss,
          original: c.url,
        };
      }),
    );

    const rows = resolved
      .filter((r) => !existingUrls.has(r.url))
      .map((r) => ({
        mission_id: data.missionId,
        feed_type: "custom",
        feed_name: r.name,
        feed_url: r.url,
        feed_description: r.description,
        is_active: true,
        is_preselected: false,
        monitoring_schedule: "daily",
      }));

    let inserted = 0;
    if (rows.length > 0) {
      const { error, data: ins } = await supabase
        .from("intelligence_feed_configs")
        .insert(rows)
        .select("id");
      if (error) throw new Error(error.message);
      inserted = ins?.length ?? rows.length;
    }
    return {
      inserted,
      skipped: resolved.length - rows.length,
      feeds: resolved,
    };
  });
