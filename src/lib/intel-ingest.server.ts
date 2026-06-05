// Server-only ingestion core. Fetches industry RSS + Federal Register sources,
// dedupes against existing market_intelligence rows, inserts new ones, and
// enriches each new row with an IRIS summary + Gemini embedding +
// cross-mission similarity match.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enrichIntelRow } from "./intel-enrich.server";

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
  // Industry / CMS / Medicare / Medicaid
  { url: "https://www.kff.org/feed/", source: "KFF Health News", category: "Medicaid" },
  { url: "https://www.healthaffairs.org/action/showFeed?type=etoc&feed=rss&jc=hlthaff", source: "Health Affairs", category: "Medicare" },
  { url: "https://www.fiercehealthcare.com/rss/xml", source: "Fierce Healthcare", category: "CMS" },
  { url: "https://www.healthcaredive.com/feeds/news/", source: "Healthcare Dive", category: "CMS" },
  { url: "https://www.cms.gov/about-cms/contact/newsroom/rss-feeds/news/feed", source: "CMS Newsroom", category: "CMS" },
  { url: "https://www.cms.gov/about-cms/contact/newsroom/rss-feeds/press-releases/feed", source: "CMS Press Releases", category: "CMS" },
  { url: "https://www.medicaid.gov/about-us/contact-us/rss-feeds/index.xml", source: "Medicaid.gov", category: "Medicaid" },

  // State Medicaid bulletins / policy
  { url: "https://www.nashp.org/feed/", source: "NASHP", category: "State" },
  { url: "https://medicaiddirectors.org/feed/", source: "NAMD", category: "State" },
  { url: "https://www.macpac.gov/feed/", source: "MACPAC", category: "State" },
  { url: "https://www.shvs.org/feed/", source: "State Health & Value Strategies", category: "State" },
  { url: "https://ccf.georgetown.edu/feed/", source: "Georgetown CCF", category: "State" },

  // Managed Care Organizations / health plans
  { url: "https://www.ahip.org/news/feed", source: "AHIP", category: "MCO" },
  { url: "https://www.fiercehealthcare.com/payer/rss.xml", source: "Fierce Healthcare Payer", category: "MCO" },
  { url: "https://www.modernhealthcare.com/section/insurance?template=rss", source: "Modern Healthcare Insurance", category: "MCO" },

  // Procurement / RFP / contracting
  { url: "https://sam.gov/api/prod/sgs/v1/search/feed/opportunities?index=opp&q=medicaid&page=0&size=25&sort=-modifiedDate", source: "SAM.gov Opportunities", category: "Procurement" },
  { url: "https://bidnetdirect.com/rss/health-and-medical", source: "BidNet Direct Health", category: "Procurement" },
  { url: "https://www.healthmanagement.com/feed/", source: "Health Management Associates", category: "Procurement" },
];

async function fetchFederalRegister(): Promise<IntelRow[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url =
    `https://www.federalregister.gov/api/v1/documents.json` +
    `?conditions[publication_date][gte]=${since}` +
    `&conditions[term]=medicaid+OR+medicare` +
    `&per_page=40&order=newest`;
  try {
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
  } catch {
    return [];
  }
}

async function fetchRss(feed: { url: string; source: string; category: string }): Promise<IntelRow[]> {
  try {
    const res = await fetch(feed.url, { headers: { accept: "application/rss+xml,application/xml,text/xml" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const { XMLParser } = await import("fast-xml-parser");
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const data = parser.parse(xml) as Record<string, unknown>;
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

export async function ingestIndustryIntelligence(): Promise<{
  inserted: number;
  enriched: number;
  fetched: number;
  sources: number;
}> {
  const [fr, ...rssResults] = await Promise.all([
    fetchFederalRegister(),
    ...RSS_FEEDS.map(fetchRss),
  ]);
  const all = [fr, ...rssResults].flat();

  const seen = new Set<string>();
  const unique = all.filter((r) => {
    const key = (r.url ?? r.title).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) return { inserted: 0, enriched: 0, fetched: 0, sources: RSS_FEEDS.length + 1 };

  const urls = unique.map((u) => u.url).filter((u): u is string => !!u);
  const { data: existing } = await supabaseAdmin
    .from("market_intelligence")
    .select("url,title")
    .or(urls.length ? `url.in.(${urls.map((u) => `"${u.replace(/"/g, '""')}"`).join(",")})` : "url.eq.__none__");
  const existingKeys = new Set((existing ?? []).map((e) => (e.url ?? e.title ?? "").toLowerCase()));

  const toInsert = unique.filter((u) => !existingKeys.has((u.url ?? u.title).toLowerCase()));

  let inserted = 0;
  let enriched = 0;
  if (toInsert.length > 0) {
    const { data: insertedRows, error } = await supabaseAdmin
      .from("market_intelligence")
      .insert(toInsert.map((r) => ({ ...r, feed_type: "industry" })))
      .select("id,title,summary,source");
    if (error) throw new Error(`Insert failed: ${error.message}`);
    inserted = insertedRows?.length ?? 0;

    for (const row of insertedRows ?? []) {
      try {
        await enrichIntelRow(row);
        enriched++;
      } catch (e) {
        console.warn("[intel-enrich] failed", row.id, e);
      }
    }
  }

  return { inserted, enriched, fetched: unique.length, sources: RSS_FEEDS.length + 1 };
}
