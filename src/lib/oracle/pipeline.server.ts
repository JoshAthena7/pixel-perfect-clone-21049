/**
 * ORACLE automated ingestion pipeline — shared server-only helpers.
 *
 * Three stages, invoked by either pg_cron (via /api/public/hooks/oracle-*)
 * or an authenticated admin via lib/oracle-pipeline.functions.ts:
 *
 *   runScraper()    — scans oracle_source_registry, enqueues new items
 *   runClassifier() — AI-classifies up to 20 pending items per run
 *   runPromoter()   — promotes classified items (score >= 30) to oracle_signals
 *
 * Server-only (filename ends with .server). Do NOT import from client code.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { debugLog } from "@/lib/debug-log";

type SupabaseAdmin = typeof supabaseAdmin;

// ============================================================
// Shared types
// ============================================================

export type ScraperResult = {
  stage: "scraper";
  sources_checked: number;
  items_queued: number;
  errors: number;
};

export type ClassifierResult = {
  stage: "classifier";
  items_classified: number;
  items_dismissed: number;
  errors: number;
};

export type PromoterResult = {
  stage: "promoter";
  items_promoted: number;
  alerts_created: number;
  errors: number;
};

// ============================================================
// STAGE 1 — Scraper
// ============================================================

const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AthenaORACLE/1.0 (+pipeline)" },
    });
  } finally {
    clearTimeout(timer);
  }
}

type RssItem = { title: string; link: string; description: string; pubDate: string | null };

function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];
  // Handle both <item> (RSS) and <entry> (Atom)
  const itemRegex = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[2];
    const pick = (tag: string): string => {
      const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block);
      if (!m) return "";
      return m[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    };
    // Atom <link href="...">
    let link = pick("link");
    if (!link) {
      const lm = /<link\b[^>]*href=["']([^"']+)["']/i.exec(block);
      if (lm) link = lm[1];
    }
    const title = pick("title");
    const description = pick("description") || pick("summary") || pick("content");
    const pubDate = pick("pubDate") || pick("updated") || pick("published") || null;
    if (title && link) items.push({ title, link, description, pubDate });
    if (items.length >= 50) break;
  }
  return items;
}

function extractHtmlContent(html: string): { title: string; text: string } {
  const stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");

  const titleMatch =
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(stripped) ||
    /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(stripped) ||
    /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(stripped);
  const title = titleMatch
    ? titleMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, 300)
    : "Untitled";

  // Prefer article tags / news containers
  const articleMatch =
    /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(stripped) ||
    /<[^>]+class=["'][^"']*(?:news|update|release|announcement|publication)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i.exec(
      stripped,
    );
  const region = articleMatch ? articleMatch[1] : stripped;
  const text = region
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  return { title, text };
}

async function markSourceSuccess(
  client: SupabaseAdmin,
  sourceId: string,
): Promise<void> {
  await client
    .from("oracle_source_registry")
    .update({ last_checked_at: new Date().toISOString(), error_count: 0, error_message: null })
    .eq("id", sourceId);
}

async function markSourceFailure(
  client: SupabaseAdmin,
  sourceId: string,
  currentErrorCount: number,
  errMsg: string,
): Promise<void> {
  const next = currentErrorCount + 1;
  await client
    .from("oracle_source_registry")
    .update({
      last_checked_at: new Date().toISOString(),
      error_count: next,
      error_message: errMsg.slice(0, 500),
      ...(next >= 3 ? { status: "error" } : {}),
    })
    .eq("id", sourceId);
}

async function enqueueItem(
  client: SupabaseAdmin,
  args: {
    sourceId: string;
    sourceName: string;
    stateCode: string | null;
    url: string;
    title: string;
    text: string;
    publishedAt: string | null;
  },
): Promise<boolean> {
  if (!args.text || args.text.length < 100) return false;

  const { data: existing } = await client
    .from("oracle_ingestion_queue")
    .select("id, status, retry_count")
    .eq("source_url", args.url)
    .maybeSingle();

  if (existing) {
    if (existing.status === "error" && (existing.retry_count ?? 0) < 3) {
      await client
        .from("oracle_ingestion_queue")
        .update({ status: "pending", error_message: null })
        .eq("id", existing.id);
      return true;
    }
    return false;
  }

  const { error } = await client.from("oracle_ingestion_queue").insert({
    oracle_source_id: args.sourceId,
    source_name: args.sourceName,
    source_url: args.url,
    state_code: args.stateCode,
    raw_title: args.title.slice(0, 500),
    raw_text: args.text.slice(0, 4000),
    raw_published_at: args.publishedAt,
    status: "pending",
  });
  if (error) {
    console.error("[oracle-scraper] enqueue failed:", error.message);
    return false;
  }
  return true;
}

export async function runScraper(): Promise<ScraperResult> {
  const client = supabaseAdmin;

  const { data: sources, error } = await client
    .from("oracle_source_registry")
    .select("id, source_name, source_type, source_url, feed_url, state_code, error_count, last_checked_at")
    .eq("status", "active")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(50);

  if (error) {
    console.error("[oracle-scraper] failed to load sources:", error.message);
    return { stage: "scraper", sources_checked: 0, items_queued: 0, errors: 1 };
  }

  const list = sources ?? [];
  debugLog.log(`[oracle-scraper] starting — checking ${list.length} active sources`);

  let queued = 0;
  let errors = 0;

  for (const src of list) {
    try {
      const targetUrl = src.source_type === "rss_feed" ? src.feed_url ?? src.source_url : src.source_url;
      if (!targetUrl) {
        await markSourceFailure(client, src.id, src.error_count ?? 0, "no URL configured");
        errors += 1;
        continue;
      }

      const res = await fetchWithTimeout(targetUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      const lastChecked = src.last_checked_at ? new Date(src.last_checked_at) : null;

      if (src.source_type === "rss_feed") {
        const items = parseRssXml(body);
        for (const it of items) {
          const pub = it.pubDate ? new Date(it.pubDate) : null;
          if (lastChecked && pub && pub <= lastChecked) continue;
          const ok = await enqueueItem(client, {
            sourceId: src.id,
            sourceName: src.source_name,
            stateCode: src.state_code,
            url: it.link,
            title: it.title,
            text: it.description || it.title,
            publishedAt: pub ? pub.toISOString() : null,
          });
          if (ok) queued += 1;
        }
      } else {
        // html_scrape (default fallback)
        const { title, text } = extractHtmlContent(body);
        const ok = await enqueueItem(client, {
          sourceId: src.id,
          sourceName: src.source_name,
          stateCode: src.state_code,
          url: src.source_url ?? targetUrl,
          title,
          text,
          publishedAt: null,
        });
        if (ok) queued += 1;
      }

      await markSourceSuccess(client, src.id);
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[oracle-scraper] source "${src.source_name}" failed:`, msg);
      await markSourceFailure(client, src.id, src.error_count ?? 0, msg);
    }
  }

  console.log(
    `[oracle-scraper] complete. ${list.length} sources checked. ${queued} new items queued. ${errors} errors.`,
  );
  return { stage: "scraper", sources_checked: list.length, items_queued: queued, errors };
}

// ============================================================
// STAGE 2 — Classifier
// ============================================================

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const CLASSIFIER_MODEL = "google/gemini-3-flash-preview";
const CLASSIFIER_BATCH = 20;

const VALID_CATEGORIES = new Set([
  "regulatory_federal",
  "regulatory_state",
  "quality_performance",
  "health_outcomes_sdoh",
  "policy_innovation",
  "evidence_base",
  "field_intelligence",
  "competitive_landscape",
]);

const VALID_URGENCY = new Set(["immediate", "high", "normal", "low"]);
const VALID_TIERS = new Set(["platform", "state", "mission"]);

type ClassifiedJson = {
  relevance_score: number;
  urgency: string;
  category: string;
  subcategory: string;
  summary: string;
  topic_tags: string[];
  win_theme_tags: string[];
  jpb_variable_tags: string[];
  taxonomy_codes: string[];
  affected_missions: string[];
  action_required: boolean;
  action_summary: string | null;
  tier: string;
};

async function classifyItem(
  apiKey: string,
  item: {
    source_name: string;
    raw_title: string;
    raw_text: string;
    raw_published_at: string | null;
  },
  missions: Array<{ id: string; name: string; state: string | null; deadline: string | null; themes: string[] }>,
  retry = false,
): Promise<{ ok: true; result: ClassifiedJson } | { ok: false; error: string; status?: number }> {
  const missionLines =
    missions.length === 0
      ? "(no active missions matched this source)"
      : missions
          .map((m) => `- ${m.name} | id=${m.id} | State: ${m.state ?? "?"} | Deadline: ${m.deadline ?? "?"} | Win themes: ${m.themes.join("; ") || "(none)"}`)
          .join("\n");

  const userPrompt = `Classify this intelligence item for Medicaid procurement relevance.

SOURCE: ${item.source_name}
TITLE: ${item.raw_title}
CONTENT: ${item.raw_text.slice(0, 1500)}
PUBLISHED: ${item.raw_published_at ?? "unknown"}

ACTIVE MISSIONS:
${missionLines}

Return this exact JSON structure:
{
  "relevance_score": <0-100 integer>,
  "urgency": "immediate"|"high"|"normal"|"low",
  "category": "regulatory_federal"|"regulatory_state"|"quality_performance"|"health_outcomes_sdoh"|"policy_innovation"|"evidence_base"|"field_intelligence"|"competitive_landscape",
  "subcategory": "<oracle_subcategory enum value>",
  "summary": "<one sentence>",
  "topic_tags": ["..."],
  "win_theme_tags": ["..."],
  "jpb_variable_tags": ["pressure_intelligence"|"stakeholder_trust"|"future_state_fit"|"implementation_confidence"|"perceived_risk"|"political_exposure"|"message_drift"],
  "taxonomy_codes": ["..."],
  "affected_missions": ["<mission-id>"|"platform"],
  "action_required": true|false,
  "action_summary": "<one sentence>"|null,
  "tier": "platform"|"state"|"mission"
}`;

  const sysPrompt = retry
    ? "Return ONLY valid JSON matching the schema. No prose, no markdown, no code fences."
    : "You are ORACLE, the intelligence classification engine for Athena Strategy Group. You classify intelligence items for Medicaid managed care procurement missions. You must return ONLY valid JSON — no other text, no markdown, no explanation.";

  let res: Response;
  try {
    res = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `gateway ${res.status}: ${text.slice(0, 200)}`, status: res.status };
  }

  const payload = (await res.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const content = payload?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) return { ok: false, error: "empty AI response" };

  try {
    const cleaned = content.replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(cleaned) as ClassifiedJson;
    return { ok: true, result: parsed };
  } catch {
    return { ok: false, error: content.slice(0, 500) };
  }
}

export async function runClassifier(): Promise<ClassifierResult> {
  const client = supabaseAdmin;
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[oracle-classifier] LOVABLE_API_KEY missing");
    return { stage: "classifier", items_classified: 0, items_dismissed: 0, errors: 1 };
  }

  const { data: pending, error } = await client
    .from("oracle_ingestion_queue")
    .select("id, source_name, source_url, raw_title, raw_text, raw_published_at, oracle_source_id, state_code, retry_count")
    .eq("status", "pending")
    .order("ingested_at", { ascending: true })
    .limit(CLASSIFIER_BATCH);

  if (error) {
    console.error("[oracle-classifier] queue read failed:", error.message);
    return { stage: "classifier", items_classified: 0, items_dismissed: 0, errors: 1 };
  }

  const items = pending ?? [];
  debugLog.log(`[oracle-classifier] starting — ${items.length} pending items`);

  // Load active mission context once
  const { data: missionRows } = await client
    .from("missions")
    .select("id, name, state, submission_deadline")
    .eq("status", "active")
    .limit(20);
  const { data: themeRows } = await client
    .from("oracle_engagement_config")
    .select("mission_id, win_themes");
  const themesByMission = new Map<string, string[]>();
  for (const row of themeRows ?? []) {
    const raw = (row as { win_themes?: unknown }).win_themes;
    const themes: string[] = Array.isArray(raw)
      ? raw
          .map((t) => (typeof t === "string" ? t : typeof t === "object" && t && "name" in t ? String((t as { name?: string }).name ?? "") : ""))
          .filter(Boolean)
      : [];
    themesByMission.set((row as { mission_id: string }).mission_id, themes);
  }
  const missions = (missionRows ?? []).map((m) => ({
    id: m.id as string,
    name: (m as { name: string }).name,
    state: (m as { state: string | null }).state ?? null,
    deadline: (m as { submission_deadline: string | null }).submission_deadline ?? null,
    themes: themesByMission.get(m.id as string) ?? [],
  }));

  let classified = 0;
  let dismissed = 0;
  let errors = 0;

  for (const item of items) {
    // Claim row first (idempotency)
    const { error: claimErr } = await client
      .from("oracle_ingestion_queue")
      .update({ status: "classifying" })
      .eq("id", item.id)
      .eq("status", "pending");
    if (claimErr) {
      debugLog.warn("[oracle-classifier] claim failed:", claimErr.message);
      continue;
    }

    // Filter mission context to those relevant by state, if known
    const stateCode = (item as { state_code: string | null }).state_code;
    const ctxMissions = stateCode
      ? missions.filter((m) => !m.state || m.state === stateCode)
      : missions;

    let attempt = await classifyItem(apiKey, item as Parameters<typeof classifyItem>[1], ctxMissions, false);
    if (!attempt.ok && (attempt.status === 429 || attempt.status === 408 || attempt.status === 504)) {
      debugLog.warn(`[oracle-classifier] gateway throttled (${attempt.status}); leaving remaining as pending`);
      // restore claim
      await client.from("oracle_ingestion_queue").update({ status: "pending" }).eq("id", item.id);
      break;
    }
    if (!attempt.ok) {
      attempt = await classifyItem(apiKey, item as Parameters<typeof classifyItem>[1], ctxMissions, true);
    }

    if (!attempt.ok) {
      errors += 1;
      await client
        .from("oracle_ingestion_queue")
        .update({
          status: "error",
          error_message: attempt.error.slice(0, 1000),
          retry_count: ((item as { retry_count: number }).retry_count ?? 0) + 1,
        })
        .eq("id", item.id);
      console.error(`[oracle-classifier] failed: ${(item as { raw_title: string }).raw_title} — ${attempt.error.slice(0, 120)}`);
      continue;
    }

    const r = attempt.result;
    const score = Math.max(0, Math.min(100, Math.round(Number(r.relevance_score) || 0)));
    const urgency = VALID_URGENCY.has(r.urgency) ? r.urgency : "normal";
    const category = VALID_CATEGORIES.has(r.category) ? r.category : "field_intelligence";
    // subcategory: keep as-is; enum cast happens at promotion. Fallback if missing.
    const subcategory = (r.subcategory && String(r.subcategory).trim()) || "news_media";

    const update = {
      classified_relevance_score: score,
      classified_urgency: urgency,
      classified_category: category,
      classified_subcategory: subcategory,
      classified_summary: r.summary?.slice(0, 1000) ?? null,
      classified_topic_tags: Array.isArray(r.topic_tags) ? r.topic_tags.slice(0, 10) : [],
      classified_win_theme_tags: Array.isArray(r.win_theme_tags) ? r.win_theme_tags.slice(0, 10) : [],
      classification_metadata: {
        jpb_variable_tags: Array.isArray(r.jpb_variable_tags) ? r.jpb_variable_tags : [],
        taxonomy_codes: Array.isArray(r.taxonomy_codes) ? r.taxonomy_codes : [],
        affected_missions: Array.isArray(r.affected_missions) ? r.affected_missions : [],
        action_required: !!r.action_required,
        action_summary: r.action_summary ?? null,
        tier: VALID_TIERS.has(r.tier) ? r.tier : "platform",
      },
      classified_at: new Date().toISOString(),
      status: score < 30 ? "dismissed" : "classified",
      error_message: null,
    } as Record<string, unknown>;

    const { error: upErr } = await client
      .from("oracle_ingestion_queue")
      // typed loosely because classification_metadata is jsonb
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(update as any)
      .eq("id", item.id);

    if (upErr) {
      errors += 1;
      await client
        .from("oracle_ingestion_queue")
        .update({ status: "error", error_message: upErr.message })
        .eq("id", item.id);
      console.error(`[oracle-classifier] persist failed:`, upErr.message);
      continue;
    }

    if (score < 30) {
      dismissed += 1;
      debugLog.log(`[oracle-classifier] dismissed (low relevance ${score}): ${(item as { raw_title: string }).raw_title.slice(0, 80)}`);
    } else {
      classified += 1;
      debugLog.log(`[oracle-classifier] classified ${score}/${urgency}: ${(item as { raw_title: string }).raw_title.slice(0, 80)}`);
    }
  }

  debugLog.log(`[oracle-classifier] complete. ${classified} classified, ${dismissed} dismissed, ${errors} errors.`);
  return { stage: "classifier", items_classified: classified, items_dismissed: dismissed, errors };
}

// ============================================================
// STAGE 3 — Promoter
// ============================================================

export async function runPromoter(): Promise<PromoterResult> {
  const client = supabaseAdmin;

  const { data: classifiedRows, error } = await client
    .from("oracle_ingestion_queue")
    .select(
      "id, source_url, source_name, oracle_source_id, state_code, raw_title, raw_published_at, classified_relevance_score, classified_urgency, classified_category, classified_subcategory, classified_summary, classified_topic_tags, classified_win_theme_tags, classification_metadata",
    )
    .eq("status", "classified")
    .gte("classified_relevance_score", 30)
    .order("classified_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[oracle-promoter] queue read failed:", error.message);
    return { stage: "promoter", items_promoted: 0, alerts_created: 0, errors: 1 };
  }

  const rows = classifiedRows ?? [];
  debugLog.log(`[oracle-promoter] starting — ${rows.length} items eligible`);

  // Preload taxonomy code → id map
  const { data: taxRows } = await client.from("oracle_taxonomy").select("id, node_code");
  const taxByCode = new Map<string, string>(
    (taxRows ?? []).map((r) => [(r as { node_code: string }).node_code, (r as { id: string }).id]),
  );

  // Preload source state_codes
  const sourceIds = Array.from(new Set(rows.map((r) => r.oracle_source_id).filter(Boolean) as string[]));
  const { data: srcRows } = sourceIds.length
    ? await client.from("oracle_source_registry").select("id, state_code").in("id", sourceIds)
    : { data: [] as Array<{ id: string; state_code: string | null }> };
  const stateBySource = new Map<string, string | null>(
    (srcRows ?? []).map((s) => [(s as { id: string }).id, (s as { state_code: string | null }).state_code]),
  );

  let promoted = 0;
  let alerts = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const meta = (row.classification_metadata ?? {}) as {
        jpb_variable_tags?: string[];
        taxonomy_codes?: string[];
        affected_missions?: string[];
        tier?: string;
      };
      const tier = VALID_TIERS.has(meta.tier ?? "") ? (meta.tier as "platform" | "state" | "mission") : "platform";

      const resolvedStateCode =
        tier === "state"
          ? row.state_code ?? stateBySource.get(row.oracle_source_id ?? "") ?? null
          : null;
      const affected = (meta.affected_missions ?? []).filter((x) => x && x !== "platform");
      const resolvedMissionId = tier === "mission" && affected[0] ? affected[0] : null;

      const taxIds = (meta.taxonomy_codes ?? [])
        .map((code) => taxByCode.get(code))
        .filter((x): x is string => !!x);

      const insertPayload = {
        title: row.raw_title.slice(0, 500),
        summary: row.classified_summary,
        category: row.classified_category,
        subcategory: row.classified_subcategory,
        urgency: row.classified_urgency,
        tier,
        scope_tier: tier, // keep the legacy sync trigger happy in case
        state_code: resolvedStateCode,
        mission_id: resolvedMissionId,
        signal_type: "policy", // satisfy legacy CHECK; the new category drives display
        topic_tags: row.classified_topic_tags ?? [],
        win_theme_tags: row.classified_win_theme_tags ?? [],
        jpb_variable_tags: meta.jpb_variable_tags ?? [],
        taxonomy_node_ids: taxIds,
        relevance_score: row.classified_relevance_score ?? 0,
        source_name: row.source_name,
        published_at: row.raw_published_at,
        ingestion_source: "automated_feed",
        status: "needs_review",
        what_happened: row.raw_title.slice(0, 500),
        why_it_matters: row.classified_summary,
        metadata: { source_url: row.source_url },
      } as Record<string, unknown>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: insErr } = await client
        .from("oracle_signals")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(insertPayload as any)
        .select("id")
        .single();

      if (insErr || !inserted) {
        errors += 1;
        await client
          .from("oracle_ingestion_queue")
          .update({ status: "error", error_message: insErr?.message ?? "insert returned no row" })
          .eq("id", row.id);
        console.error("[oracle-promoter] insert failed:", insErr?.message);
        continue;
      }

      await client
        .from("oracle_ingestion_queue")
        // 'promoted' is added to oracle_ingestion_status enum via migration.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          status: "promoted",
          promoted_node_id: inserted.id,
          promoted_at: new Date().toISOString(),
        } as any)
        .eq("id", row.id);

      promoted += 1;

      // High-signal alerts → write to intel_events for each affected mission
      const score = row.classified_relevance_score ?? 0;
      const urgent = row.classified_urgency === "immediate" || row.classified_urgency === "high";
      if (score >= 85 && urgent && affected.length) {
        for (const mid of affected) {
          const { error: evErr } = await client
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("intel_events" as any)
            .insert({
              mission_id: mid,
              event_type: "oracle_high_signal",
              source_type: "oracle",
              title: row.raw_title.slice(0, 300),
              summary: `⚡ ORACLE: ${row.classified_summary ?? row.raw_title}`,
              severity: "high",
              metadata: { signal_id: inserted.id, source_url: row.source_url, score, urgency: row.classified_urgency },
            });
          if (!evErr) alerts += 1;
        }
      }
    } catch (err) {
      errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[oracle-promoter] row failed:", msg);
      await client
        .from("oracle_ingestion_queue")
        .update({ status: "error", error_message: msg.slice(0, 1000) })
        .eq("id", row.id);
    }
  }

  debugLog.log(`[oracle-promoter] complete. ${promoted} promoted, ${alerts} alerts.`);
  return { stage: "promoter", items_promoted: promoted, alerts_created: alerts, errors };
}
