import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type IntelRow = {
  title: string;
  summary: string | null;
  source: string;
  url: string | null;
  type: string;
  category: string | null;
  published_at: string | null;
};

const RSS_FEEDS: Array<{ url: string; source: string; category: string }> = [
  { url: "https://www.cms.gov/newsroom/rss-feeds/all-press-releases-and-fact-sheets/feed", source: "CMS Newsroom", category: "CMS" },
  { url: "https://www.medicaid.gov/about-us/news-and-blog/index.rss", source: "Medicaid.gov", category: "Medicaid" },
  { url: "https://www.hhs.gov/about/news/rss/news.xml", source: "HHS News", category: "CMS" },
];

async function fetchFederalRegister(): Promise<IntelRow[]> {
  // Medicaid + Medicare documents from the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url =
    `https://www.federalregister.gov/api/v1/documents.json` +
    `?conditions[publication_date][gte]=${since}` +
    `&conditions[term]=medicaid+OR+medicare` +
    `&per_page=40&order=newest`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: Array<Record<string, unknown>> };
  return (json.results ?? []).map((d) => ({
    title: String(d.title ?? "").slice(0, 500),
    summary: typeof d.abstract === "string" ? d.abstract.slice(0, 2000) : null,
    source: "Federal Register",
    url: typeof d.html_url === "string" ? d.html_url : null,
    type: String(d.type ?? "Rule"),
    category: /medicaid/i.test(String(d.title ?? "")) ? "Medicaid" : "Medicare",
    published_at: typeof d.publication_date === "string" ? `${d.publication_date}T00:00:00Z` : null,
  }));
}

async function fetchRss(feed: { url: string; source: string; category: string }): Promise<IntelRow[]> {
  try {
    const res = await fetch(feed.url, { headers: { accept: "application/rss+xml,application/xml,text/xml" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const data = parser.parse(xml) as Record<string, unknown>;
    // Support both RSS and Atom
    const rssItems =
      (data?.rss as { channel?: { item?: unknown } } | undefined)?.channel?.item ??
      (data?.feed as { entry?: unknown } | undefined)?.entry ??
      [];
    const items = Array.isArray(rssItems) ? rssItems : [rssItems];
    return items
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .slice(0, 25)
      .map((item) => {
        const title = String(item.title ?? "").slice(0, 500);
        const link =
          typeof item.link === "string"
            ? item.link
            : (item.link as { "@_href"?: string } | undefined)?.["@_href"] ?? null;
        const desc =
          typeof item.description === "string"
            ? item.description
            : typeof item.summary === "string"
              ? item.summary
              : null;
        const pub = (item.pubDate ?? item.published ?? item.updated) as string | undefined;
        return {
          title,
          summary: desc ? desc.replace(/<[^>]+>/g, "").slice(0, 2000) : null,
          source: feed.source,
          url: link,
          type: "news",
          category: feed.category,
          published_at: pub ? new Date(pub).toISOString() : null,
        } satisfies IntelRow;
      })
      .filter((r) => r.title);
  } catch {
    return [];
  }
}

export const ingestMarketIntel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Pull all sources in parallel
    const [fr, ...rssResults] = await Promise.all([
      fetchFederalRegister(),
      ...RSS_FEEDS.map(fetchRss),
    ]);
    const all = [fr, ...rssResults].flat();

    // Dedupe by URL or title
    const seen = new Set<string>();
    const unique = all.filter((r) => {
      const key = (r.url ?? r.title).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      return { inserted: 0, fetched: 0 };
    }

    // Filter out already-stored URLs (last 30 days lookup)
    const urls = unique.map((u) => u.url).filter((u): u is string => !!u);
    const { data: existing } = await supabase
      .from("market_intelligence")
      .select("url,title")
      .or(urls.length ? `url.in.(${urls.map((u) => `"${u.replace(/"/g, '""')}"`).join(",")})` : "url.eq.__none__");
    const existingKeys = new Set(
      (existing ?? []).map((e) => (e.url ?? e.title ?? "").toLowerCase()),
    );

    const toInsert = unique.filter((u) => {
      const key = (u.url ?? u.title).toLowerCase();
      return !existingKeys.has(key);
    });

    let inserted = 0;
    if (toInsert.length > 0) {
      // market_intelligence has no public INSERT policy for authenticated; use admin client
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error, count } = await supabaseAdmin
        .from("market_intelligence")
        .insert(toInsert, { count: "exact" });
      if (error) throw new Error(`Insert failed: ${error.message}`);
      inserted = count ?? toInsert.length;
    }

    await supabase.from("olympus_audit_log").insert({
      user_id: userId,
      action_type: "market_intel_ingested",
      action_summary: `Ingested ${inserted} new market intelligence items (${unique.length} fetched)`,
      target_table: "market_intelligence",
    });

    return { inserted, fetched: unique.length, sources: RSS_FEEDS.length + 1 };
  });
