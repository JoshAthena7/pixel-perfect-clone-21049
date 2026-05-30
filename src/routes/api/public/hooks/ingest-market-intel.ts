// /api/public/hooks/ingest-market-intel
// Ingests market intelligence from RSS feeds, Federal Register, Congress.gov, and KFF.
// All sources run in parallel via Promise.allSettled. After ingestion, runs semantic
// matching against active engagement embeddings and creates intelligence_insights rows.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";
import { embedText, pgvectorLiteral } from "@/lib/intelligence/embed";

export const Route = createFileRoute("/api/public/hooks/ingest-market-intel")({
  server: {
    handlers: { POST: handler, GET: handler },
  },
});

// ---------------- Shared helpers ----------------

const PROGRAM_AREAS = [
  "Care Management","Behavioral Health","LTSS","HCBS","Network Adequacy",
  "Quality","Staffing","IT Systems","Financial","Dual Eligible","IDD",
];

const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function detectStates(text: string): string[] {
  const t = ` ${text} `.toUpperCase();
  return US_STATES.filter((s) => t.includes(` ${s} `));
}

// Tiny RSS/Atom parser — no deps, Worker-safe.
function parseFeed(xml: string) {
  const items: Array<{ title: string; summary: string; url: string; published_at: string | null }> = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/g) ?? xml.match(/<entry[\s\S]*?<\/entry>/g) ?? [];
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
  }
  return items;
}

// Lovable AI Gateway helper (uses LOVABLE_API_KEY — no extra cost vs OpenAI direct).
async function lovableAIClassify(prompt: string): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
    if (!res.ok) return "";
    const j: any = await res.json();
    return j?.choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}

async function classifyProgramAreas(title: string, abstract: string): Promise<string[]> {
  const prompt = `Classify the following CMS document into 0-3 of these program areas: ${PROGRAM_AREAS.join(", ")}.
Reply ONLY with a comma-separated list of matching area names, or "none" if no match.

TITLE: ${title}
ABSTRACT: ${abstract.slice(0, 1500)}`;
  const out = await lovableAIClassify(prompt);
  if (!out || out.toLowerCase().includes("none")) return [];
  return out.split(",").map((s) => s.trim()).filter((s) => PROGRAM_AREAS.includes(s));
}

const BILL_KEYWORDS = ["Medicaid","Medicare","CHIP","managed care","LTSS","HCBS","behavioral health","dual eligible"];
function billMatchesKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return BILL_KEYWORDS.filter((k) => lower.includes(k.toLowerCase()));
}

// ---------------- Source 1: Federal Register ----------------

async function ingestFederalRegister(supabase: SupabaseClient, openaiKey?: string) {
  const url = "https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=centers-for-medicare-medicaid-services&conditions[type][]=RULE&conditions[type][]=PROPOSED_RULE&per_page=20&order=newest&fields[]=title&fields[]=abstract&fields[]=effective_on&fields[]=publication_date&fields[]=html_url&fields[]=document_number&fields[]=type";
  const res = await fetch(url, { headers: { "User-Agent": "AthenaIntel/1.0" } });
  if (!res.ok) throw new Error(`Federal Register HTTP ${res.status}`);
  const json: any = await res.json();
  const docs: any[] = json?.results ?? [];

  let inserted = 0, skipped = 0;
  for (const d of docs) {
    const docNum = String(d.document_number ?? "");
    if (!docNum) { skipped++; continue; }

    const { data: existing } = await supabase
      .from("market_intelligence")
      .select("id")
      .eq("source", "Federal Register")
      .contains("raw_data", { document_number: docNum })
      .limit(1);
    if (existing && existing.length > 0) { skipped++; continue; }

    const title = String(d.title ?? "").slice(0, 500);
    const abstract = String(d.abstract ?? "");
    const areas = await classifyProgramAreas(title, abstract);
    const states = detectStates(`${title} ${abstract}`);

    let embedding: string | null = null;
    if (openaiKey) {
      const vec = await embedText(`${title} ${abstract}`, openaiKey);
      if (vec) embedding = pgvectorLiteral(vec);
    }

    const { error } = await supabase.from("market_intelligence").insert({
      source: "Federal Register",
      title,
      summary: abstract.slice(0, 2000),
      url: d.html_url ?? null,
      relevant_states: states,
      relevant_categories: areas,
      published_at: d.effective_on ?? d.publication_date ?? null,
      raw_data: {
        document_number: docNum,
        document_type: d.type ?? null,
        effective_on: d.effective_on ?? null,
        source_detail: `CMS ${d.type ?? "Document"}`,
      } as any,
      embedding: embedding as any,
    });
    if (!error) inserted++; else skipped++;
  }
  return { inserted, skipped };
}

// ---------------- Source 2: Congress.gov ----------------

async function ingestCongress(supabase: SupabaseClient, openaiKey?: string) {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("CONGRESS_API_KEY not configured");
  const url = `https://api.congress.gov/v3/bill?limit=20&sort=updateDate+desc&format=json&api_key=${key}`;
  const res = await fetch(url, { headers: { "User-Agent": "AthenaIntel/1.0" } });
  if (!res.ok) throw new Error(`Congress.gov HTTP ${res.status}`);
  const json: any = await res.json();
  const bills: any[] = json?.bills ?? [];

  let inserted = 0, skipped = 0;
  for (const b of bills) {
    const billNum = `${b.type ?? ""}.${b.number ?? ""}`;
    const title = String(b.title ?? "");
    const action = String(b.latestAction?.text ?? "");
    const blob = `${title} ${action}`;
    const matches = billMatchesKeywords(blob);
    if (matches.length === 0) { skipped++; continue; }

    const sourceDetail = billNum;
    const { data: existing } = await supabase
      .from("market_intelligence")
      .select("id")
      .eq("source", "Congress.gov")
      .contains("raw_data", { bill_number: billNum })
      .limit(1);
    if (existing && existing.length > 0) { skipped++; continue; }

    const congress = b.congress ?? "";
    const type = String(b.type ?? "").toLowerCase();
    const number = b.number ?? "";
    const billUrl = congress && type && number
      ? `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`
      : null;

    let embedding: string | null = null;
    if (openaiKey) {
      const vec = await embedText(blob, openaiKey);
      if (vec) embedding = pgvectorLiteral(vec);
    }

    const { error } = await supabase.from("market_intelligence").insert({
      source: "Congress.gov",
      title: title.slice(0, 500),
      summary: action.slice(0, 2000),
      url: billUrl,
      relevant_states: [],
      relevant_categories: matches.map((m) => `topic:${m}`),
      published_at: b.latestAction?.actionDate ?? b.updateDate ?? null,
      raw_data: {
        bill_number: billNum,
        congress,
        source_detail: sourceDetail,
      } as any,
      embedding: embedding as any,
    });
    if (!error) inserted++; else skipped++;
  }
  return { inserted, skipped };
}

// ---------------- Source 3: KFF (via Firecrawl) ----------------

async function ingestKFF(supabase: SupabaseClient, openaiKey?: string) {
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) throw new Error("FIRECRAWL_API_KEY not configured");

  const pages = [
    { url: "https://www.kff.org/medicaid/state-indicator/total-medicaid-enrollees/", field: "medicaid_enrollment" as const },
    { url: "https://www.kff.org/medicaid/state-indicator/medicaid-managed-care-enrollment-and-penetration-rates/", field: "managed_care_pct" as const },
  ];

  const stateRows = new Map<string, { medicaid_enrollment?: number; managed_care_pct?: number; data_year?: string; source_url?: string }>();
  let dataYear = "";

  for (const p of pages) {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${fcKey}` },
      body: JSON.stringify({ url: p.url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status} for ${p.url}`);
    const j: any = await res.json();
    const md: string = j?.data?.markdown ?? j?.markdown ?? "";

    // Try to extract year from markdown
    const yearMatch = md.match(/\b(20\d{2})\b/);
    if (yearMatch && !dataYear) dataYear = yearMatch[1];

    // Parse table rows: "| State Name | value |"
    const lines = md.split("\n");
    for (const line of lines) {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      if (cells.length < 2) continue;
      const stateName = cells[0];
      const valueRaw = cells[1].replace(/,/g, "").replace(/%/g, "");
      const value = parseFloat(valueRaw);
      if (!isFinite(value)) continue;
      const stateAbbr = stateNameToAbbr(stateName);
      if (!stateAbbr) continue;
      const existing = stateRows.get(stateAbbr) ?? {};
      existing[p.field] = value;
      existing.source_url = p.url;
      stateRows.set(stateAbbr, existing);
    }
  }

  // Upsert state_market_data rows
  let statesUpdated = 0;
  for (const [state, row] of stateRows.entries()) {
    const { error } = await supabase.from("state_market_data").upsert({
      state,
      medicaid_enrollment: row.medicaid_enrollment ?? null,
      managed_care_pct: row.managed_care_pct ?? null,
      data_year: dataYear || null,
      source_url: row.source_url ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "state" });
    if (!error) statesUpdated++;
  }

  // Summary row in market_intelligence
  const summaryText = `Updated Medicaid enrollment and managed care penetration data across ${statesUpdated} states${dataYear ? ` — ${dataYear}` : ""}.`;
  let embedding: string | null = null;
  if (openaiKey) {
    const vec = await embedText(summaryText, openaiKey);
    if (vec) embedding = pgvectorLiteral(vec);
  }
  await supabase.from("market_intelligence").insert({
    source: "KFF",
    title: `KFF State Medicaid Enrollment Update${dataYear ? ` (${dataYear})` : ""}`,
    summary: summaryText,
    url: pages[0].url,
    relevant_states: Array.from(stateRows.keys()),
    relevant_categories: ["Financial", "Network Adequacy"],
    published_at: new Date().toISOString(),
    raw_data: { source_detail: "State Medicaid Enrollment", data_year: dataYear } as any,
    embedding: embedding as any,
  });

  return { states_updated: statesUpdated };
}

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",delaware:"DE",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",massachusetts:"MA",michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV","new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA","rhode island":"RI","south carolina":"SC","south dakota":"SD",tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",virginia:"VA",washington:"WA","west virginia":"WV",wisconsin:"WI",wyoming:"WY","district of columbia":"DC",
};
function stateNameToAbbr(name: string): string | null {
  const cleaned = name.toLowerCase().replace(/[*\[\]]/g, "").trim();
  return STATE_NAME_TO_ABBR[cleaned] ?? null;
}

// ---------------- Source 4: NewsAPI ----------------

const NEWS_PROGRAM_AREAS = [
  "Care Management","Behavioral Health","LTSS","HCBS","Network Adequacy",
  "Quality","Staffing","Financial","Dual Eligible","IDD",
];

async function classifyNewsProgramAreas(title: string, description: string): Promise<string[]> {
  const prompt = `Classify the following news article into 0-3 of these program areas: ${NEWS_PROGRAM_AREAS.join(", ")}.
Reply ONLY with a comma-separated list of matching area names, or "none" if no match.

TITLE: ${title}
DESCRIPTION: ${description.slice(0, 1500)}`;
  const out = await lovableAIClassify(prompt);
  if (!out || out.toLowerCase().includes("none")) return [];
  return out.split(",").map((s) => s.trim()).filter((s) => NEWS_PROGRAM_AREAS.includes(s));
}

const STATE_NAMES_FOR_SCAN: Array<[string, string]> = Object.entries(STATE_NAME_TO_ABBR);
function detectStatesFromText(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  // Abbreviations (word-bounded uppercase)
  for (const s of detectStates(text)) found.add(s);
  // Full names
  for (const [name, abbr] of STATE_NAMES_FOR_SCAN) {
    if (lower.includes(` ${name} `) || lower.includes(` ${name},`) || lower.includes(` ${name}.`)) {
      found.add(abbr);
    }
  }
  return Array.from(found);
}

async function ingestNewsAPI(supabase: SupabaseClient, openaiKey?: string, runStartMs?: number) {
  const key = process.env.NEWS_API_KEY;
  if (!key) throw new Error("NEWS_API_KEY not configured");

  const q = encodeURIComponent('Medicaid OR Medicare OR "managed care" OR LTSS OR HCBS OR "behavioral health" OR "dual eligible"');
  const url = `https://newsapi.org/v2/everything?q=${q}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${key}`;
  const res = await fetch(url, { headers: { "User-Agent": "AthenaIntel/1.0" } });
  if (!res.ok) throw new Error(`NewsAPI HTTP ${res.status}`);
  const json: any = await res.json();
  const articles: any[] = json?.articles ?? [];

  const cutoff = (runStartMs ?? Date.now()) - 6 * 3600 * 1000;
  let inserted = 0, skipped = 0;

  for (const a of articles) {
    const articleUrl: string = a?.url ?? "";
    const publishedAtStr: string = a?.publishedAt ?? "";
    const publishedMs = publishedAtStr ? new Date(publishedAtStr).getTime() : NaN;
    if (!articleUrl || !isFinite(publishedMs) || publishedMs < cutoff) { skipped++; continue; }

    const { count } = await supabase
      .from("market_intelligence")
      .select("id", { count: "exact", head: true })
      .eq("url", articleUrl);
    if ((count ?? 0) > 0) { skipped++; continue; }

    const title = String(a.title ?? "").slice(0, 500);
    const description = String(a.description ?? "");
    const sourceDetail = String(a?.source?.name ?? "");
    const blob = `${title} ${description}`;

    const [areas, states] = [await classifyNewsProgramAreas(title, description), detectStatesFromText(blob)];

    let embedding: string | null = null;
    if (openaiKey) {
      const vec = await embedText(blob, openaiKey);
      if (vec) embedding = pgvectorLiteral(vec);
    }

    const { error } = await supabase.from("market_intelligence").insert({
      source: "NewsAPI",
      title,
      summary: description.slice(0, 2000),
      url: articleUrl,
      relevant_states: states,
      relevant_categories: areas,
      published_at: new Date(publishedMs).toISOString(),
      raw_data: { source_detail: sourceDetail } as any,
      embedding: embedding as any,
    });
    if (!error) inserted++; else skipped++;
  }
  return { inserted, skipped };
}

// ---------------- Existing RSS sources (preserved) ----------------

const BASE_FEEDS: Array<{ source: string; url: string }> = [
  { source: "CMS Newsroom", url: "https://www.cms.gov/newsroom/rss-feeds/all-press-releases.xml" },
  { source: "HHS Press", url: "https://www.hhs.gov/about/news/rss/full.xml" },
  { source: "GovExec", url: "https://www.govexec.com/rss/all/" },
];

async function ingestRSS(supabase: SupabaseClient, openaiKey?: string) {
  const { data: targets } = await supabase.from("monitoring_targets").select("target_type,value");
  const keywords = (targets ?? []).filter((t: any) => t.target_type === "keyword").map((t: any) => String(t.value));
  const competitors = (targets ?? []).filter((t: any) => t.target_type === "competitor").map((t: any) => String(t.value));

  let inserted = 0;
  for (const feed of BASE_FEEDS) {
    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": "AthenaIntel/1.0" } });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseFeed(xml);
      for (const it of items) {
        if (it.url) {
          const { count } = await supabase.from("market_intelligence").select("id", { count: "exact", head: true }).eq("url", it.url);
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
    }
  }
  return { inserted };
}

// ---------------- Engagement matching ----------------

async function matchToEngagements(supabase: SupabaseClient, sinceIso: string) {
  // Fetch newly inserted MI rows
  const { data: newRows } = await supabase
    .from("market_intelligence")
    .select("id,title,summary,source,raw_data,embedding")
    .gte("ingested_at", sinceIso);

  if (!newRows || newRows.length === 0) return 0;

  // Get active engagements
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id,name,status")
    .not("status", "in", "(Archived,Submitted,Won,Lost,Closed)");
  if (!engagements || engagements.length === 0) return 0;

  // Get base confidence for external_signal
  const { data: weight } = await supabase
    .from("insight_type_weights")
    .select("base_confidence")
    .eq("insight_type", "external_signal")
    .maybeSingle();
  const baseConfidence = Number(weight?.base_confidence ?? 0.6);

  const openaiKey = process.env.OPENAI_API_KEY;
  let matchesCreated = 0;

  for (const mi of newRows) {
    let embeddingLiteral: string | null = (mi as any).embedding ?? null;
    if (!embeddingLiteral && openaiKey) {
      const vec = await embedText(`${mi.title ?? ""} ${mi.summary ?? ""}`, openaiKey);
      if (vec) {
        embeddingLiteral = pgvectorLiteral(vec);
        await supabase.from("market_intelligence").update({ embedding: embeddingLiteral as any }).eq("id", mi.id);
      }
    }
    if (!embeddingLiteral) continue;

    for (const eng of engagements) {
      const { data: matches } = await supabase.rpc("search_similar_content", {
        query_embedding: embeddingLiteral as any,
        match_engagement_id: eng.id,
        match_threshold: 0.78,
        match_count: 3,
      });
      if (!matches || (matches as any[]).length === 0) continue;

      // Dedupe — skip if insight for same MI already exists for engagement
      const { data: existing } = await supabase
        .from("intelligence_insights")
        .select("id")
        .eq("engagement_id", eng.id)
        .eq("insight_type", "external_signal")
        .contains("supporting_data", { market_intelligence_id: mi.id })
        .limit(1);
      if (existing && existing.length > 0) continue;

      // Severity bump for Federal Register RULE within 90 days
      let severity = "info";
      const rd: any = mi.raw_data ?? {};
      if (mi.source === "Federal Register" && rd.document_type === "Rule" && rd.effective_on) {
        const eff = new Date(rd.effective_on).getTime();
        if (isFinite(eff) && eff - Date.now() < 90 * 24 * 3600 * 1000 && eff > Date.now() - 7 * 24 * 3600 * 1000) {
          severity = "warning";
        }
      }

      // AI-generated one-sentence implication
      const implication = await lovableAIClassify(
        `In ONE sentence, explain how this development affects the "${eng.name}" engagement.\nDEVELOPMENT: ${mi.title}\n${(mi.summary ?? "").slice(0, 600)}`
      );

      const { error } = await supabase.from("intelligence_insights").insert({
        engagement_id: eng.id,
        insight_type: "external_signal",
        title: String(mi.title ?? "").slice(0, 500),
        body: implication || (mi.summary ?? "").slice(0, 500),
        severity,
        confidence_score: baseConfidence,
        supporting_data: { market_intelligence_id: mi.id, source: mi.source, similarity: (matches as any[])[0]?.similarity } as any,
      });
      if (!error) matchesCreated++;
    }
  }
  return matchesCreated;
}

// ---------------- Handler ----------------

async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const openaiKey = process.env.OPENAI_API_KEY;
  const runStart = new Date().toISOString();

  // Run RSS (preserved) + 3 new sources in parallel
  const [rssRes, frRes, congressRes, kffRes] = await Promise.allSettled([
    ingestRSS(supabase, openaiKey),
    ingestFederalRegister(supabase, openaiKey),
    ingestCongress(supabase, openaiKey),
    ingestKFF(supabase, openaiKey),
  ]);

  async function logFailure(name: string, err: unknown) {
    try {
      await supabase.from("activity_log").insert({
        engagement_id: null,
        user_id: null,
        actor_name: "Athena Intel",
        action: "intel_ingest_failed",
        metadata: { source: name, error: String(err instanceof Error ? err.message : err) } as any,
      });
    } catch {/* ignore */}
  }

  const result = {
    rss: rssRes.status === "fulfilled" ? { ...rssRes.value, error: null } : { inserted: 0, error: String(rssRes.reason) },
    federal_register: frRes.status === "fulfilled" ? { ...frRes.value, error: null } : { inserted: 0, skipped: 0, error: String(frRes.reason) },
    congress: congressRes.status === "fulfilled" ? { ...congressRes.value, error: null } : { inserted: 0, skipped: 0, error: String(congressRes.reason) },
    kff: kffRes.status === "fulfilled" ? { ...kffRes.value, error: null } : { states_updated: 0, error: String(kffRes.reason) },
    matches_created: 0,
  };

  if (rssRes.status === "rejected") await logFailure("rss", rssRes.reason);
  if (frRes.status === "rejected") await logFailure("federal_register", frRes.reason);
  if (congressRes.status === "rejected") await logFailure("congress", congressRes.reason);
  if (kffRes.status === "rejected") await logFailure("kff", kffRes.reason);

  // Run engagement matching
  try {
    result.matches_created = await matchToEngagements(supabase, runStart);
  } catch (e) {
    await logFailure("engagement_matching", e);
  }

  return Response.json(result);
}
