/**
 * IRIS Daily Monitor — Athena Signal Network engine.
 *
 * Pulls active sources from `intel_sources` whose cadence matches the
 * incoming `?cadence=daily|weekly` query, fetches each source, hashes the
 * content for delta detection, asks IRIS (via the Lovable AI Gateway) to
 * classify any new content, and routes the resulting signals to the
 * appropriate ATLAS tables.
 *
 * All work is fire-and-forget per-source — a single failure never stops the
 * loop. Errors are logged to console only.
 *
 * Auth (one of):
 *   x-cron-secret: CRON_HOOK_SECRET
 *   apikey:        CRON_HOOK_SECRET   (pg_cron compatibility)
 *
 * Schedule with pg_cron (see README).
 *
 * LinkedIn is explicitly excluded. PDF classification is deferred — PDFs are
 * stubbed into intel_events with routing_status='needs_pdf_extraction'.
 */
import { createFileRoute } from "@tanstack/react-router";

type Source = {
  id: string;
  tier: number | null;
  source_type: string | null;
  signal_category: string | null;
  rss_url: string | null;
  scrape_url: string | null;
  url: string | null;
  notes: string | null;
  last_content_hash: string | null;
  monitor_cadence: string | null;
};

type ParsedItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
};

type IrisSignal = {
  title: string;
  summary: string;
  output_type: string;
  signal_category: string;
  state: string | null;
  population: string | null;
  relevance_score: number;
  confidence_score: number;
  iris_recommendation: string;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|h\d|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseRssItems(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  // RSS 2.0 <item>
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const tag = (block: string, name: string) => {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
    if (!m) return undefined;
    return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  };
  for (const block of xml.match(itemRe) ?? []) {
    items.push({
      title: tag(block, "title"),
      link: tag(block, "link"),
      pubDate: tag(block, "pubDate") ?? tag(block, "dc:date"),
      description: tag(block, "description") ?? tag(block, "content:encoded"),
    });
  }
  // Atom <entry>
  if (items.length === 0) {
    const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;
    for (const block of xml.match(entryRe) ?? []) {
      const linkMatch = block.match(/<link[^>]*href="([^"]+)"/i);
      items.push({
        title: tag(block, "title"),
        link: linkMatch?.[1],
        pubDate: tag(block, "updated") ?? tag(block, "published"),
        description: tag(block, "summary") ?? tag(block, "content"),
      });
    }
  }
  return items.slice(0, 25); // cap per source
}

function isLinkedIn(url: string | null | undefined): boolean {
  return !!url && /linkedin\.com/i.test(url);
}

function shouldSkipType(t: string | null): boolean {
  // Human-ingested only — not scraped here.
  return t === "internal_debrief" || t === "manual_upload";
}

function isWebpageType(t: string | null): boolean {
  return (
    t === "webpage" ||
    t === "procurement_portal" ||
    t === "legislative" ||
    t === "budget" ||
    t === "meeting_agenda" ||
    t === "job_posting" ||
    t === "advocacy" ||
    t === "provider_association" ||
    t === "conference"
  );
}

const SYSTEM_PROMPT_TEMPLATE = (s: {
  name: string;
  tier: number | null;
  signal_category: string | null;
  url: string;
}) =>
  `You are IRIS, the intelligence engine for ATLAS — a government healthcare procurement intelligence platform used by Athena Strategy Group.

You have just received content from a monitored intelligence source. Your job is to extract meaningful signals and classify each one.

Source details:
- Name: ${s.name}
- Tier: ${s.tier ?? "unknown"}
- Signal Category: ${s.signal_category ?? "unknown"}
- URL: ${s.url}

For each distinct signal you identify in the content, output a JSON array. Each signal must have:
- title: short descriptive title (max 10 words)
- summary: 2-3 sentence explanation of what this means for Medicaid managed care procurement
- output_type: one of [signal, opportunity, risk_candidate, intel_card_candidate, mission_brief_update_candidate, oracle_memory_candidate]
- signal_category: one of [federal_policy, state_policy, waiver, procurement, competitor, stakeholder, provider_friction, advocacy_pressure, workforce, rates, behavioral_health, child_welfare, LTSS, IDD, duals, crisis, health_equity, market_movement, decision_intelligence, relationship_intelligence]
- state: two-letter state code if state-specific, otherwise null
- population: affected population if identifiable (e.g. "duals", "children", "LTSS", "BH"), otherwise null
- relevance_score: 0-100 (100 = directly impacts active Medicaid managed care procurements)
- confidence_score: 0-100
- iris_recommendation: one sentence on what Athena should do with this signal

Output ONLY valid JSON array. No preamble. No explanation outside the array.
If no meaningful signals exist in the content, return an empty array [].

Signal classification guide:
- signal: something changed or is changing in the Medicaid landscape
- opportunity: creates strategic advantage for Athena or a client
- risk_candidate: threatens an active mission or future pursuit
- intel_card_candidate: reusable fact for future proposals or missions
- mission_brief_update_candidate: should update an active Mission Brief
- oracle_memory_candidate: institutional knowledge to preserve for future missions`;

async function classifyWithIris(args: {
  apiKey: string;
  systemPrompt: string;
  content: string;
}): Promise<IrisSignal[] | "non_json"> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
        "Lovable-API-Key": args.apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: args.systemPrompt },
          { role: "user", content: args.content.slice(0, 20_000) },
        ],
      }),
    });
    if (!res.ok) {
      console.log("[iris-daily-monitor] gateway error", res.status, await res.text().catch(() => ""));
      return "non_json";
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = (j.choices?.[0]?.message?.content ?? "").trim();
    const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return "non_json";
    return parsed as IrisSignal[];
  } catch (e) {
    console.log("[iris-daily-monitor] IRIS classify failed", e);
    return "non_json";
  }
}

const FAIL_PREFIX = "__fail:";
function nextFailureHash(prev: string | null): { hash: string; count: number } {
  let n = 0;
  if (prev && prev.startsWith(FAIL_PREFIX)) {
    n = parseInt(prev.slice(FAIL_PREFIX.length), 10) || 0;
  }
  n += 1;
  return { hash: `${FAIL_PREFIX}${n}`, count: n };
}

export const Route = createFileRoute("/api/public/hooks/iris-daily-monitor")({
  server: {
    handlers: {
      OPTIONS: async () => new Response("ok", { headers: CORS_HEADERS }),

      GET: async ({ request }) => runMonitor(request),
      POST: async ({ request }) => runMonitor(request),
    },
  },
});

async function runMonitor(request: Request): Promise<Response> {
  // Auth: cron secret OR explicit dev token; if neither secret is configured, refuse.
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("apikey") ??
    new URL(request.url).searchParams.get("token");
  const expected = process.env.CRON_HOOK_SECRET ?? process.env.DEV_SEED_TOKEN;
  if (!expected || !provided || provided !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  const url = new URL(request.url);
  const cadence = (url.searchParams.get("cadence") ?? "daily").toLowerCase();
  if (!["daily", "weekly", "monthly", "mission_triggered", "manual"].includes(cadence)) {
    return json({ error: "Invalid cadence" }, 400);
  }

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.log("[iris-daily-monitor] LOVABLE_API_KEY missing — classification disabled");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();

  const { data: sources, error: srcErr } = await supabaseAdmin
    .from("intel_sources")
    .select(
      "id, tier, source_type, signal_category, rss_url, scrape_url, url, notes, last_content_hash, monitor_cadence",
    )
    .eq("is_active", true)
    .eq("monitor_cadence", cadence)
    .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`);

  if (srcErr) {
    console.log("[iris-daily-monitor] failed to query sources", srcErr.message);
    return json({ error: "Source query failed" }, 500);
  }

  const runAt = new Date().toISOString();
  const summary = {
    run_at: runAt,
    cadence,
    sources_checked: 0,
    sources_skipped_no_change: 0,
    sources_failed: 0,
    signals_extracted: 0,
    intel_events_written: 0,
    oracle_cards_written: 0,
  };

  for (const s of (sources ?? []) as Source[]) {
    summary.sources_checked += 1;
    try {
      const t = s.source_type;
      if (shouldSkipType(t)) {
        await supabaseAdmin
          .from("intel_sources")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", s.id)
          .then(({ error }) => error && console.log("[iris-daily-monitor] update skip src failed", error.message));
        continue;
      }

      const fetchUrl =
        (t === "rss" ? s.rss_url : s.scrape_url) ?? s.scrape_url ?? s.rss_url ?? s.url;
      if (!fetchUrl || isLinkedIn(fetchUrl)) {
        await supabaseAdmin
          .from("intel_sources")
          .update({ last_checked_at: new Date().toISOString() })
          .eq("id", s.id)
          .then(({ error }) => error && console.log("[iris-daily-monitor] update placeholder failed", error.message));
        continue;
      }

      // Fetch
      let res: Response;
      try {
        res = await fetch(fetchUrl, {
          headers: { "User-Agent": "ATLAS-IRIS-Monitor/1.0 (+https://athenacommandcenter.com)" },
          redirect: "follow",
        });
      } catch (e) {
        console.log("[iris-daily-monitor] fetch threw", s.id, e);
        await recordFailure(supabaseAdmin, s);
        summary.sources_failed += 1;
        continue;
      }

      if (!res.ok) {
        console.log("[iris-daily-monitor] fetch !ok", s.id, fetchUrl, res.status);
        if (res.status === 404 || res.status === 403) {
          await recordFailure(supabaseAdmin, s);
        } else {
          await supabaseAdmin
            .from("intel_sources")
            .update({ last_checked_at: new Date().toISOString() })
            .eq("id", s.id);
        }
        summary.sources_failed += 1;
        continue;
      }

      const rawBody = await res.text();
      const hashHex = await sha256Hex(rawBody);

      if (s.last_content_hash && s.last_content_hash === hashHex) {
        summary.sources_skipped_no_change += 1;
        await supabaseAdmin
          .from("intel_sources")
          .update({
            last_checked_at: new Date().toISOString(),
            last_successful_check_at: new Date().toISOString(),
          })
          .eq("id", s.id);
        continue;
      }

      // PDFs: stub and defer
      if (t === "pdf") {
        await supabaseAdmin.from("intel_events").insert({
          mission_id: null,
          event_type: "extraction",
          title: `PDF source pending extraction: ${s.notes ?? fetchUrl}`,
          content: `PDF at ${fetchUrl} flagged for extraction in a later pass.`,
          source_type: "pdf",
          source_id: s.id,
          source_url: fetchUrl,
          source_title: s.notes ?? null,
          source_published_at: new Date().toISOString(),
          extracted_summary: null,
          signal_category: s.signal_category,
          output_type: "intel_card_candidate",
          routing_status: "needs_pdf_extraction",
          generated_by: "iris",
        });
        summary.intel_events_written += 1;

        await supabaseAdmin
          .from("intel_sources")
          .update({
            last_checked_at: new Date().toISOString(),
            last_successful_check_at: new Date().toISOString(),
            last_content_hash: hashHex,
          })
          .eq("id", s.id);
        continue;
      }

      // Build classifier input
      let classifierBody = "";
      let perItemMeta: Array<{ link?: string; pubDate?: string; title?: string }> = [];
      if (t === "rss") {
        const items = parseRssItems(rawBody);
        if (items.length === 0) {
          classifierBody = stripHtml(rawBody).slice(0, 8000);
        } else {
          classifierBody = items
            .map(
              (it, i) =>
                `(${i + 1}) ${it.title ?? ""}\n${stripHtml(it.description ?? "")}\nURL: ${it.link ?? ""}\nPublished: ${it.pubDate ?? ""}`,
            )
            .join("\n\n---\n\n");
          perItemMeta = items.map((it) => ({ link: it.link, pubDate: it.pubDate, title: it.title }));
        }
      } else if (isWebpageType(t)) {
        classifierBody = stripHtml(rawBody).slice(0, 12000);
      } else {
        // Unknown type — try webpage fallback
        classifierBody = stripHtml(rawBody).slice(0, 12000);
      }

      // Mark success on the source (hash + timestamps) regardless of IRIS outcome
      await supabaseAdmin
        .from("intel_sources")
        .update({
          last_checked_at: new Date().toISOString(),
          last_successful_check_at: new Date().toISOString(),
          last_content_hash: hashHex,
        })
        .eq("id", s.id);

      if (!apiKey) continue;

      const systemPrompt = SYSTEM_PROMPT_TEMPLATE({
        name: s.notes ?? fetchUrl,
        tier: s.tier,
        signal_category: s.signal_category,
        url: fetchUrl,
      });

      const classified = await classifyWithIris({
        apiKey,
        systemPrompt,
        content: classifierBody,
      });

      if (classified === "non_json") {
        // Non-JSON gateway response → stash raw as a single needs_review card
        await supabaseAdmin.from("intel_events").insert({
          mission_id: null,
          event_type: "extraction",
          title: `Unparsed scan: ${s.notes ?? fetchUrl}`,
          content: classifierBody.slice(0, 4000),
          source_type: "web_monitor",
          source_id: s.id,
          source_url: fetchUrl,
          source_title: s.notes ?? null,
          source_published_at: new Date().toISOString(),
          extracted_summary: null,
          signal_category: s.signal_category,
          output_type: "intel_card_candidate",
          routing_status: "needs_review",
          generated_by: "iris",
        });
        summary.intel_events_written += 1;
        continue;
      }

      for (let i = 0; i < classified.length; i++) {
        const sig = classified[i];
        if (!sig || typeof sig !== "object") continue;
        summary.signals_extracted += 1;
        const meta = perItemMeta[i] ?? {};
        const sigUrl = meta.link ?? fetchUrl;

        const { error: evErr } = await supabaseAdmin.from("intel_events").insert({
          mission_id: null,
          event_type: "signal",
          title: String(sig.title ?? "Signal").slice(0, 240),
          content: String(sig.summary ?? ""),
          source_type: "web_monitor",
          source_id: s.id,
          source_url: sigUrl,
          source_title: meta.title ?? sig.title ?? null,
          source_published_at: meta.pubDate ?? new Date().toISOString(),
          extracted_summary: sig.summary ?? null,
          iris_recommendation: sig.iris_recommendation ?? null,
          output_type: sig.output_type ?? "signal",
          signal_category: sig.signal_category ?? s.signal_category,
          state: sig.state ?? null,
          population: sig.population ?? null,
          relevance_score: typeof sig.relevance_score === "number" ? sig.relevance_score : null,
          confidence_score: typeof sig.confidence_score === "number" ? sig.confidence_score : null,
          routing_status: "unreviewed",
          generated_by: "iris",
        });
        if (evErr) {
          console.log("[iris-daily-monitor] intel_events insert failed", evErr.message);
        } else {
          summary.intel_events_written += 1;
        }

        if (sig.output_type === "intel_card_candidate" && (sig.relevance_score ?? 0) >= 70) {
          const conf = sig.confidence_score ?? 0;
          const { error: kbErr } = await supabaseAdmin.from("oracle_knowledge_base").insert({
            mission_id: null,
            core_insight: String(sig.summary ?? sig.title ?? ""),
            topic_tags: [sig.signal_category, sig.population].filter(Boolean) as string[],
            confidence: conf >= 80 ? "high" : conf >= 50 ? "medium" : "low",
            source_summary: String(sig.title ?? ""),
            extracted_by: "iris",
          });
          if (kbErr) {
            console.log("[iris-daily-monitor] oracle_knowledge_base insert failed", kbErr.message);
          } else {
            summary.oracle_cards_written += 1;
          }
        }
      }
    } catch (e) {
      console.log("[iris-daily-monitor] per-source loop threw", s.id, e);
      summary.sources_failed += 1;
    }
  }

  return json(summary);
}

async function recordFailure(
  supabaseAdmin: Awaited<ReturnType<typeof getAdmin>>,
  s: Source,
): Promise<void> {
  const { hash, count } = nextFailureHash(s.last_content_hash);
  const patch: Record<string, unknown> = {
    last_checked_at: new Date().toISOString(),
    last_content_hash: hash,
  };
  if (count >= 3) patch.is_active = false;
  const { error } = await supabaseAdmin.from("intel_sources").update(patch).eq("id", s.id);
  if (error) console.log("[iris-daily-monitor] recordFailure update failed", error.message);
}

// Convenience for the type above
async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
