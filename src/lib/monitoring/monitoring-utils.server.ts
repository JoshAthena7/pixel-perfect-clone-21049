// Server-only monitoring utilities. Imported only from server route handlers
// and server function handlers (via dynamic import) — the `.server.ts` suffix
// keeps it out of client bundles.
//
// Requires env: LOVABLE_API_KEY (AI Gateway). Service-role Supabase client is
// passed in by callers so we don't load it at module scope here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

export type RssFeedItem = {
  title: string;
  description: string;
  link: string;
  pubDate: string | null;
  content: string;
};

export type MissionContext = {
  missionId: string;
  name: string;
  state: string | null;
  agency: string | null;
  programType: string | null;
  winThemes: string[];
  centralClaim: string | null;
  sections: Array<{ id: string; name: string | null; number: string | null }>;
  feedConfigs: Array<{ id: string; feed_type: string; feed_url: string | null }>;
};

export type RelevanceAssessment = {
  relevance_score: number;
  is_relevant: boolean;
  iris_assessment: string;
  affected_section_types: string[];
  recommended_action: string;
  category: string;
};

const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  trimValues: true,
});

export async function fetchRssFeed(url: string): Promise<RssFeedItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "ATLAS-IRIS-Monitor/1.0", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();
    const parsed = xmlParser.parse(xml) as Record<string, unknown>;

    // RSS 2.0: rss > channel > item[]
    const channel = (parsed.rss as { channel?: { item?: unknown } } | undefined)?.channel;
    if (channel?.item) {
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];
      return items.map((raw): RssFeedItem => {
        const it = raw as Record<string, unknown>;
        const desc = (it.description as string) ?? "";
        const content = ((it as Record<string, string>)["content:encoded"] as string) ?? "";
        return {
          title: stripHtml(String(it.title ?? "")),
          description: stripHtml(String(desc)),
          link: typeof it.link === "string" ? it.link : (it.link as Record<string, string>)?.["@_href"] ?? "",
          pubDate: (it.pubDate as string) ?? (it.date as string) ?? null,
          content: stripHtml(String(content || desc)),
        };
      }).filter((i) => i.title && i.link);
    }

    // Atom: feed > entry[]
    const feed = parsed.feed as { entry?: unknown } | undefined;
    if (feed?.entry) {
      const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];
      return entries.map((raw): RssFeedItem => {
        const e = raw as Record<string, unknown>;
        const linkRaw = e.link;
        let link = "";
        if (typeof linkRaw === "string") link = linkRaw;
        else if (Array.isArray(linkRaw)) link = (linkRaw[0] as Record<string, string>)?.["@_href"] ?? "";
        else if (linkRaw && typeof linkRaw === "object") link = (linkRaw as Record<string, string>)["@_href"] ?? "";
        const summary = (e.summary as { "#text"?: string } | string) ?? "";
        const content = (e.content as { "#text"?: string } | string) ?? "";
        const titleRaw = (e.title as { "#text"?: string } | string) ?? "";
        const toText = (v: unknown) => typeof v === "string" ? v : (v as { "#text"?: string })?.["#text"] ?? "";
        return {
          title: stripHtml(toText(titleRaw)),
          description: stripHtml(toText(summary)),
          link,
          pubDate: (e.published as string) ?? (e.updated as string) ?? null,
          content: stripHtml(toText(content) || toText(summary)),
        };
      }).filter((i) => i.title && i.link);
    }

    return [];
  } catch (err) {
    console.error("fetchRssFeed failed", url, err);
    return [];
  }
}

const missionContextCache = new Map<string, { at: number; ctx: MissionContext }>();

export async function getMissionContext(
  missionId: string,
  supabase: SupabaseClient,
): Promise<MissionContext | null> {
  const cached = missionContextCache.get(missionId);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.ctx;

  const { data: m } = await supabase
    .from("missions")
    .select("id,name,state,agency_name,program_type")
    .eq("id", missionId)
    .maybeSingle();
  if (!m) return null;

  const [{ data: ws }, { data: sects }, { data: feeds }] = await Promise.all([
    supabase.from("mission_win_strategy").select("win_themes,central_claim").eq("mission_id", missionId).maybeSingle(),
    supabase.from("mission_sections").select("id,section_name,section_number").eq("mission_id", missionId),
    supabase.from("intelligence_feed_configs").select("id,feed_type,feed_url").eq("mission_id", missionId).eq("is_active", true),
  ]);

  let winThemes: string[] = [];
  const wt = ws?.win_themes;
  if (Array.isArray(wt)) winThemes = wt.map((x) => typeof x === "string" ? x : (x as { theme?: string; title?: string })?.theme ?? (x as { title?: string })?.title ?? "").filter(Boolean);
  else if (wt && typeof wt === "object") winThemes = Object.values(wt as Record<string, unknown>).map(String);

  const ctx: MissionContext = {
    missionId,
    name: (m as { name: string }).name,
    state: (m as { state?: string | null }).state ?? null,
    agency: (m as { agency_name?: string | null }).agency_name ?? null,
    programType: (m as { program_type?: string | null }).program_type ?? null,
    winThemes,
    centralClaim: ws?.central_claim ?? null,
    sections: (sects ?? []).map((s) => ({
      id: (s as { id: string }).id,
      name: (s as { section_name: string | null }).section_name,
      number: (s as { section_number: string | null }).section_number,
    })),
    feedConfigs: (feeds ?? []).map((f) => ({
      id: (f as { id: string }).id,
      feed_type: (f as { feed_type: string }).feed_type,
      feed_url: (f as { feed_url: string | null }).feed_url,
    })),
  };
  missionContextCache.set(missionId, { at: Date.now(), ctx });
  return ctx;
}

const VALID_CATEGORIES = new Set([
  "federal_policy", "state_policy", "state_legislative", "competitive", "research", "news",
]);

export async function assessRelevance(
  item: RssFeedItem,
  ctx: MissionContext,
  apiKey: string,
): Promise<RelevanceAssessment> {
  const empty: RelevanceAssessment = {
    relevance_score: 0, is_relevant: false, iris_assessment: "",
    affected_section_types: [], recommended_action: "", category: "news",
  };
  try {
    const system =
      "You are an intelligence analyst for a Medicaid procurement team. Return ONLY valid JSON matching: { relevance_score: number 0-100, is_relevant: boolean (true if score >= 40), iris_assessment: string (2-3 sentences explaining why this matters or does not matter to this specific mission — only populate if is_relevant is true), affected_section_types: string[] (which types of proposal sections this affects — e.g. care_coordination, network_adequacy, quality, equity, behavioral_health), recommended_action: string (one sentence — only if is_relevant is true), category: string (one of: federal_policy, state_policy, state_legislative, competitive, research, news) }.";
    const user = `Mission: ${ctx.name}
State: ${ctx.state ?? "n/a"}
Agency: ${ctx.agency ?? "n/a"}
Program: ${ctx.programType ?? "n/a"}
Win Themes: ${ctx.winThemes.join(" | ") || "none"}
News item title: ${item.title}
News item summary: ${item.description.slice(0, 1500)}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!r.ok) return empty;
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = j.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return empty;
    const parsed = JSON.parse(match[0]) as Partial<RelevanceAssessment>;
    const score = Math.max(0, Math.min(100, Number(parsed.relevance_score ?? 0)));
    const cat = String(parsed.category ?? "news");
    return {
      relevance_score: score,
      is_relevant: score >= 40,
      iris_assessment: String(parsed.iris_assessment ?? ""),
      affected_section_types: Array.isArray(parsed.affected_section_types) ? parsed.affected_section_types.map(String) : [],
      recommended_action: String(parsed.recommended_action ?? ""),
      category: VALID_CATEGORIES.has(cat) ? cat : "news",
    };
  } catch (err) {
    console.error("assessRelevance failed", err);
    return empty;
  }
}

export async function checkForDuplicate(
  missionId: string,
  sourceUrl: string,
  supabase: SupabaseClient,
): Promise<boolean> {
  if (!sourceUrl) return false;
  const { data } = await supabase
    .from("intelligence_feed_items")
    .select("id")
    .eq("mission_id", missionId)
    .eq("source_url", sourceUrl)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function createFeedItem(
  missionId: string,
  feedConfigId: string,
  feedConfigName: string | null,
  item: RssFeedItem,
  assessment: RelevanceAssessment,
  supabase: SupabaseClient,
): Promise<void> {
  const { data: inserted, error } = await supabase
    .from("intelligence_feed_items")
    .insert({
      mission_id: missionId,
      feed_config_id: feedConfigId,
      category: assessment.category,
      headline: item.title.slice(0, 500),
      summary: item.description.slice(0, 2000),
      full_content: item.content.slice(0, 8000),
      source_url: item.link,
      source_name: feedConfigName ?? "Feed",
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      iris_relevance_score: assessment.relevance_score,
      iris_assessment: assessment.iris_assessment || null,
      recommended_action: assessment.recommended_action || null,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("createFeedItem insert failed", error);
    return;
  }

  // Bump feed config stats
  const { data: cfg } = await supabase
    .from("intelligence_feed_configs")
    .select("total_items_found")
    .eq("id", feedConfigId)
    .maybeSingle();
  await supabase
    .from("intelligence_feed_configs")
    .update({
      last_item_found_at: new Date().toISOString(),
      total_items_found: ((cfg?.total_items_found as number | undefined) ?? 0) + 1,
    })
    .eq("id", feedConfigId);

  // High-relevance alerts to admins + engagement leads
  if (assessment.relevance_score >= 70) {
    const [admins, leads] = await Promise.all([
      supabase.from("user_roles").select("user_id").eq("role", "admin"),
      supabase.from("mission_team_members").select("member_id,mission_role").eq("mission_id", missionId),
    ]);
    const recipientIds = new Set<string>();
    (admins.data ?? []).forEach((r) => recipientIds.add((r as { user_id: string }).user_id));
    (leads.data ?? []).forEach((r) => {
      const role = (r as { mission_role: string | null }).mission_role ?? "";
      if (/engagement|lead|principal/i.test(role)) recipientIds.add((r as { member_id: string }).member_id);
    });
    const firstSentence = (assessment.iris_assessment || "").split(/(?<=[.!?])\s/)[0] ?? "";
    const message = `New intelligence: ${item.title.slice(0, 120)}. Relevance: ${assessment.relevance_score}/100. ${firstSentence}`.slice(0, 500);
    if (recipientIds.size > 0) {
      await supabase.from("atlas_notifications").insert(
        Array.from(recipientIds).map((id) => ({
          type: "iris_alert",
          recipient_id: id,
          recipient_role: "user",
          message,
          metadata: { mission_id: missionId, feed_item_id: inserted.id, score: assessment.relevance_score },
        })),
      );
    }
  }
}

/** Process a single feed config: fetch URL, filter by date, assess, create items. */
export async function processFeedConfig(
  config: { id: string; feed_url: string | null; feed_name?: string | null },
  ctx: MissionContext,
  supabase: SupabaseClient,
  apiKey: string,
  sinceMs: number,
): Promise<{ checked: number; created: number }> {
  const stats = { checked: 0, created: 0 };
  if (!config.feed_url) return stats;
  let items: RssFeedItem[] = [];
  try {
    items = await fetchRssFeed(config.feed_url);
  } catch (err) {
    console.error("feed fetch failed", config.feed_url, err);
  }
  const cutoff = Date.now() - sinceMs;
  const fresh = items.filter((i) => {
    if (!i.pubDate) return true;
    const t = new Date(i.pubDate).getTime();
    return Number.isFinite(t) ? t >= cutoff : true;
  }).slice(0, 25); // safety cap per feed

  for (const item of fresh) {
    try {
      stats.checked += 1;
      if (await checkForDuplicate(ctx.missionId, item.link, supabase)) continue;
      const assessment = await assessRelevance(item, ctx, apiKey);
      await new Promise((r) => setTimeout(r, 500)); // rate limit
      if (!assessment.is_relevant) continue;
      await createFeedItem(ctx.missionId, config.id, config.feed_name ?? null, item, assessment, supabase);
      stats.created += 1;
    } catch (err) {
      console.error("item process failed", err);
    }
  }

  await supabase
    .from("intelligence_feed_configs")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("id", config.id);

  return stats;
}

/** Run a categorized set of feeds for one mission. */
export async function runFeedsForMission(
  missionId: string,
  feedTypes: string[],
  supabase: SupabaseClient,
  apiKey: string,
  sinceMs: number,
): Promise<{ feeds: number; checked: number; created: number }> {
  const ctx = await getMissionContext(missionId, supabase);
  if (!ctx) return { feeds: 0, checked: 0, created: 0 };
  const { data: configs } = await supabase
    .from("intelligence_feed_configs")
    .select("id,feed_url,feed_name,feed_type")
    .eq("mission_id", missionId)
    .eq("is_active", true)
    .in("feed_type", feedTypes);

  let checked = 0, created = 0;
  for (const cfg of (configs ?? [])) {
    try {
      const r = await processFeedConfig(cfg as { id: string; feed_url: string | null; feed_name: string | null }, ctx, supabase, apiKey, sinceMs);
      checked += r.checked;
      created += r.created;
    } catch (err) {
      console.error("feed config failed", err);
    }
  }
  return { feeds: (configs ?? []).length, checked, created };
}
