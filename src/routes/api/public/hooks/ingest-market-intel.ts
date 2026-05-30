// /api/public/hooks/ingest-market-intel
// Pulls RSS feeds tied to monitoring_targets + a curated set of govcon sources,
// embeds the summary, and stores rows in market_intelligence.

import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { embedText, pgvectorLiteral } from "@/lib/intelligence/embed";

export const Route = createFileRoute("/api/public/hooks/ingest-market-intel")({
  server: {
    handlers: { POST: handler, GET: handler },
  },
});

// Curated baseline sources (procurement / Medicaid / health policy adjacent)
const BASE_FEEDS: Array<{ source: string; url: string }> = [
  { source: "CMS Newsroom", url: "https://www.cms.gov/newsroom/rss-feeds/all-press-releases.xml" },
  { source: "HHS Press", url: "https://www.hhs.gov/about/news/rss/full.xml" },
  { source: "GovExec", url: "https://www.govexec.com/rss/all/" },
];

// Tiny RSS/Atom parser — no deps, Worker-safe.
function parseFeed(xml: string, source: string) {
  const items: Array<{ title: string; summary: string; url: string; published_at: string | null }> = [];
  const itemBlocks =
    xml.match(/<item[\s\S]*?<\/item>/g) ?? xml.match(/<entry[\s\S]*?<\/entry>/g) ?? [];
  for (const block of itemBlocks.slice(0, 25)) {
    const pick = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      if (!m) return "";
      let v = m[1];
      const cd = v.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      if (cd) v = cd[1];
      return v.replace(/<[^>]+>/g, "").trim();
    };
    const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i) ?? block.match(/<link[^>]*>([^<]+)<\/link>/i);
    const title = pick("title");
    if (!title) continue;
    const summary = pick("description") || pick("summary") || pick("content");
    const url = (linkMatch?.[1] ?? "").trim();
    const pub = pick("pubDate") || pick("published") || pick("updated");
    const published_at = pub ? new Date(pub).toISOString() : null;
    items.push({ title, summary: summary.slice(0, 2000), url, published_at });
    void source;
  }
  return items;
}

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function detectStates(text: string): string[] {
  const t = ` ${text} `.toUpperCase();
  return US_STATES.filter((s) => t.includes(` ${s} `));
}

async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const openaiKey = process.env.OPENAI_API_KEY;

  // Pull extra keyword targets from monitoring_targets
  const { data: targets } = await supabase
    .from("monitoring_targets")
    .select("target_type,value");

  const keywords = (targets ?? []).filter((t: any) => t.target_type === "keyword").map((t: any) => String(t.value));
  const competitors = (targets ?? []).filter((t: any) => t.target_type === "competitor").map((t: any) => String(t.value));

  const results: Record<string, number> = {};
  let inserted = 0;

  for (const feed of BASE_FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": "AthenaIntel/1.0" } });
      if (!res.ok) { results[feed.source] = -1; continue; }
      const xml = await res.text();
      const items = parseFeed(xml, feed.source);
      results[feed.source] = items.length;

      for (const it of items) {
        // dedupe by URL
        if (it.url) {
          const { count } = await supabase
            .from("market_intelligence")
            .select("id", { count: "exact", head: true })
            .eq("url", it.url);
          if ((count ?? 0) > 0) continue;
        }
        const blob = `${it.title} ${it.summary}`;
        const states = detectStates(blob);
        const cats: string[] = [];
        for (const k of keywords) if (blob.toLowerCase().includes(k.toLowerCase())) cats.push(`keyword:${k}`);
        for (const c of competitors) if (blob.toLowerCase().includes(c.toLowerCase())) cats.push(`competitor:${c}`);

        let embedding: string | null = null;
        if (openaiKey) {
          const vec = await embedText(blob, openaiKey);
          if (vec) embedding = pgvectorLiteral(vec);
        }

        const { error } = await supabase.from("market_intelligence").insert({
          source: feed.source,
          title: it.title.slice(0, 500),
          summary: it.summary,
          url: it.url || null,
          relevant_states: states,
          relevant_categories: cats,
          published_at: it.published_at,
          embedding: embedding as any,
        });
        if (!error) inserted++;
      }
    } catch (e) {
      console.error("feed error", feed.source, e);
      results[feed.source] = -1;
    }
  }

  return Response.json({ inserted, per_feed: results });
}
