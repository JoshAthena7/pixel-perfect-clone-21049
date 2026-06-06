/**
 * Shared helpers for the IRIS extractor pipeline.
 *
 * Server-only. Never import from a route or component module scope.
 * Imported by *.functions.ts files via `await import(...)` inside handlers.
 */
import { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type MissionContext = {
  id: string;
  name: string;
  client: string | null;
  state: string | null;
  state_agency: string | null;
  procurement_name: string | null;
  program_type: string | null;
  description: string | null;
  key_requirements: string[] | null;
  win_themes: string[] | null;
  priority_topics: string[] | null;
  competitors: string[] | null;
  focus_areas: string[] | null;
  incumbent_name: string | null;
  submission_date: string | null;
};

export type MarketRow = {
  id: string;
  title: string;
  source: string;
  summary: string | null;
  url: string | null;
  category: string | null;
  feed_type: string;
  published_at: string | null;
};

/**
 * Load mission + relevant market intelligence rows.
 *
 * Relevance heuristic: mission tagged on row, OR state/agency/program_type
 * keywords match title/summary. Falls back to the last-60-day full feed
 * (capped at MAX_ROWS) when no targeted matches exist — keeps extractors
 * useful for new tenants whose feed hasn't been tuned yet.
 */
export async function loadMissionAndFeed(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  missionId: string,
  MAX_ROWS = 25,
): Promise<{ mission: MissionContext; rows: MarketRow[]; broadened: boolean }> {
  const { data: m, error: mErr } = await supabase
    .from("missions")
    .select(
      "id,name,client,state,state_agency,procurement_name,program_type,description,key_requirements,win_themes,priority_topics,competitors,focus_areas,incumbent_name,submission_date",
    )
    .eq("id", missionId)
    .maybeSingle();
  if (mErr) throw new Error(`load mission: ${mErr.message}`);
  if (!m) throw new Error(`Mission ${missionId} not found`);
  const mission = m as MissionContext;

  const { data: tagged } = await supabase
    .from("market_intelligence")
    .select("id,title,source,summary,url,category,feed_type,published_at")
    .or(`mission_id.eq.${missionId},matched_mission_ids.cs.{${missionId}}`)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  let rows = (tagged ?? []) as MarketRow[];
  let broadened = false;

  if (rows.length < 5) {
    // Score the broader feed against mission keywords client-side.
    const cutoff = new Date(Date.now() - 60 * 86400000).toISOString();
    const { data: recent } = await supabase
      .from("market_intelligence")
      .select("id,title,source,summary,url,category,feed_type,published_at")
      .gte("published_at", cutoff)
      .order("published_at", { ascending: false })
      .limit(150);
    const kws = buildKeywords(mission);
    const scored = ((recent ?? []) as MarketRow[])
      .map((r) => ({ r, score: scoreRow(r, kws) }))
      .sort((a, b) => b.score - a.score)
      .map(({ r }) => r);
    const seen = new Set(rows.map((r) => r.id));
    for (const r of scored) {
      if (seen.has(r.id)) continue;
      rows.push(r);
      seen.add(r.id);
      if (rows.length >= MAX_ROWS) break;
    }
    broadened = true;
  }

  return { mission, rows, broadened };
}

function buildKeywords(m: MissionContext): string[] {
  const raw = [
    m.state,
    m.state_agency,
    m.program_type,
    m.procurement_name,
    m.incumbent_name,
    ...(m.priority_topics ?? []),
    ...(m.competitors ?? []),
    ...(m.focus_areas ?? []),
    ...(m.win_themes ?? []),
  ];
  return raw
    .filter((s): s is string => !!s && s.trim().length > 2)
    .map((s) => s.toLowerCase());
}

function scoreRow(r: MarketRow, kws: string[]): number {
  const hay = `${r.title ?? ""} ${r.summary ?? ""} ${r.category ?? ""}`.toLowerCase();
  let s = 0;
  for (const k of kws) if (hay.includes(k)) s += 1;
  return s;
}

/** Renders mission + rows into the user message every extractor uses. */
export function renderContext(mission: MissionContext, rows: MarketRow[]): string {
  const meta = [
    `MISSION: ${mission.name}`,
    mission.client ? `Client: ${mission.client}` : null,
    mission.state ? `State: ${mission.state}` : null,
    mission.state_agency ? `Agency: ${mission.state_agency}` : null,
    mission.procurement_name ? `Procurement: ${mission.procurement_name}` : null,
    mission.program_type ? `Program type: ${mission.program_type}` : null,
    mission.incumbent_name ? `Incumbent: ${mission.incumbent_name}` : null,
    mission.submission_date ? `Submission: ${mission.submission_date}` : null,
    mission.description ? `Description: ${mission.description}` : null,
    mission.key_requirements?.length ? `Key requirements: ${mission.key_requirements.join(" | ")}` : null,
    mission.win_themes?.length ? `Seed win themes: ${mission.win_themes.join(" | ")}` : null,
    mission.priority_topics?.length ? `Priority topics: ${mission.priority_topics.join(" | ")}` : null,
    mission.competitors?.length ? `Known competitors: ${mission.competitors.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const feed = rows.length
    ? rows
        .map(
          (r, i) =>
            `[${i + 1}] ${r.title}\n    source: ${r.source}${r.published_at ? ` · ${r.published_at.slice(0, 10)}` : ""}${r.category ? ` · ${r.category}` : ""}\n    ${(r.summary ?? "").replace(/\s+/g, " ").slice(0, 380)}${r.url ? `\n    url: ${r.url}` : ""}`,
        )
        .join("\n\n")
    : "(no market intelligence rows available)";

  return `${meta}\n\nRECENT MARKET INTELLIGENCE\n${feed}`;
}

/**
 * Call the Lovable AI Gateway with a JSON tool schema and return the
 * tool-call arguments parsed against the provided Zod schema.
 *
 * Returns null on any failure (missing key, network, JSON parse, schema
 * mismatch). Caller decides whether to fall back or skip the insert.
 */
export async function callJsonExtractor<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  parametersSchema: Record<string, unknown>;
  zodSchema: z.ZodType<T>;
  model?: string;
}): Promise<T | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[iris-extractor] LOVABLE_API_KEY not set");
    return null;
  }
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: opts.toolName,
              description: opts.toolDescription,
              parameters: opts.parametersSchema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: opts.toolName } },
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[iris-extractor] gateway ${res.status}: ${t.slice(0, 300)}`);
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const parsed = JSON.parse(args);
    const validated = opts.zodSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn("[iris-extractor] schema mismatch:", validated.error.message.slice(0, 300));
      return null;
    }
    return validated.data;
  } catch (e) {
    console.warn("[iris-extractor] call failed:", (e as Error).message);
    return null;
  }
}

export type ExtractorResult = {
  stage: string;
  inserted: number;
  skipped?: boolean;
  reason?: string;
  ms: number;
};
