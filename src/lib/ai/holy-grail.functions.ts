import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_TEXT = 60000;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ---------- Shared helpers ----------

function parseJsonObject(raw: string): any {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return {};
  }
}

async function callAi(system: string, user: string, model = "google/gemini-2.5-flash"): Promise<any> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured.");
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit hit — try again in a minute.");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in Settings → Workspace.");
    throw new Error(`AI analysis failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseJsonObject(json.choices?.[0]?.message?.content ?? "");
}

type Snippet = { url: string; title: string; markdown: string };

async function firecrawlSearch(query: string, limit = 5): Promise<{ snippets: Snippet[]; urls: string[] }> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    // soft fail — return empty so AI can still summarize from RFP/config alone
    return { snippets: [], urls: [] };
  }
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        limit,
        scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
      }),
    });
    if (!res.ok) {
      console.warn("Firecrawl search failed", res.status, await res.text().catch(() => ""));
      return { snippets: [], urls: [] };
    }
    const json = (await res.json()) as any;
    // v2 returns { success, data: { web: [{url,title,description,markdown,...}] } }  OR  { success, data: [...] }
    const raw: any[] = json?.data?.web ?? json?.data ?? [];
    const snippets: Snippet[] = raw.slice(0, limit).map((r: any) => ({
      url: r.url ?? r.metadata?.sourceURL ?? "",
      title: r.title ?? r.metadata?.title ?? "",
      markdown: typeof r.markdown === "string" ? r.markdown.slice(0, 6000) : (r.description ?? "").slice(0, 600),
    }));
    return {
      snippets: snippets.filter((s) => s.url),
      urls: snippets.map((s) => s.url).filter(Boolean),
    };
  } catch (err) {
    console.warn("Firecrawl error", err);
    return { snippets: [], urls: [] };
  }
}

function snippetsToPrompt(snippets: Snippet[]): string {
  if (!snippets.length) return "(No external sources available. Use only the RFP and engagement context.)";
  return snippets
    .map((s, i) => `### Source ${i + 1}: ${s.title}\nURL: ${s.url}\n\n${s.markdown}`)
    .join("\n\n---\n\n");
}

// ---------- Cache (server-side via supabase context) ----------

async function getCached(
  supabase: any,
  cacheKey: string,
  force: boolean,
): Promise<{ snippets: Snippet[]; urls: string[] } | null> {
  if (force) return null;
  const { data } = await supabase
    .from("web_research_cache")
    .select("result, source_urls, expires_at")
    .eq("cache_key", cacheKey)
    .gte("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return { snippets: (data.result as any).snippets ?? [], urls: data.source_urls ?? [] };
}

async function setCached(
  supabase: any,
  cacheKey: string,
  category: string,
  query: string,
  res: { snippets: Snippet[]; urls: string[] },
) {
  await supabase
    .from("web_research_cache")
    .upsert(
      {
        cache_key: cacheKey,
        category,
        query,
        result: { snippets: res.snippets },
        source_urls: res.urls,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "cache_key" },
    );
}

async function researchWithCache(
  supabase: any,
  category: string,
  query: string,
  force: boolean,
  limit = 5,
) {
  const cacheKey = `${category}::${query}`.toLowerCase().slice(0, 500);
  const cached = await getCached(supabase, cacheKey, force);
  if (cached) return cached;
  const fresh = await firecrawlSearch(query, limit);
  if (fresh.snippets.length) await setCached(supabase, cacheKey, category, query, fresh);
  return fresh;
}

// ---------- Auth gate ----------

async function assertLeadership(supabase: any, userId: string, engagementId: string) {
  const { data: member } = await supabase
    .from("engagement_members")
    .select("role, display_name")
    .eq("engagement_id", engagementId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!member || !["founder", "pm", "engagement_lead"].includes(member.role)) {
    throw new Error("Only leadership can run Holy Grail analysis.");
  }
  return member;
}

async function loadEngagementContext(supabase: any, engagementId: string) {
  const [{ data: eng }, { data: cfg }, { data: opp }] = await Promise.all([
    supabase.from("engagements").select("name, client, state, market, submission_date, contract_value_estimate").eq("id", engagementId).maybeSingle(),
    supabase.from("engagement_config").select("*").eq("engagement_id", engagementId).maybeSingle(),
    supabase.from("engagement_research").select("content").eq("engagement_id", engagementId).eq("category", "holy_grail_opportunity").maybeSingle(),
  ]);
  return { eng: eng ?? {}, cfg: cfg ?? {}, opportunity: opp?.content ?? {} };
}

function ctxLine(ctx: any): string {
  const e = ctx.eng, c = ctx.cfg, o = ctx.opportunity;
  return [
    `Engagement: ${e.name ?? "?"} (client: ${e.client ?? "?"})`,
    `State: ${e.state ?? c.state ?? "?"} | Market: ${e.market ?? c.market ?? "?"}`,
    `Incumbent: ${c.incumbent ?? o.incumbents?.join(", ") ?? "unknown"}`,
    `Likely competitors: ${(c.competitors ?? []).join(", ") || "unknown"}`,
    `Program: ${o.program_name ?? "?"} | Agency: ${o.agency ?? "?"}`,
    `Contract term: ${o.contract_term ?? "?"} | Budget: ${o.budget ?? "?"}`,
  ].join("\n");
}

async function saveSection(
  supabase: any,
  engagementId: string,
  category: string,
  title: string,
  content: any,
  sources: string[],
  confidence: number,
) {
  await supabase
    .from("engagement_research")
    .delete()
    .eq("engagement_id", engagementId)
    .eq("category", category);
  const merged = { ...content, _sources: sources };
  const { error } = await supabase
    .from("engagement_research")
    .insert({
      engagement_id: engagementId,
      category,
      title,
      content: merged,
      confidence_score: confidence,
      source: sources[0] ?? null,
    });
  if (error) throw new Error(error.message);
}

async function updateRun(supabase: any, runId: string, patch: Record<string, any>) {
  await supabase.from("holy_grail_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", runId);
}

// ============================================================
// EXPORTED SERVER FUNCTIONS
// ============================================================

// ---------- Start a run ----------
export const startHolyGrailRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ engagementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const member = await assertLeadership(supabase, userId, data.engagementId);
    const { data: run, error } = await supabase
      .from("holy_grail_runs")
      .insert({
        engagement_id: data.engagementId,
        triggered_by: userId,
        triggered_by_name: member.display_name,
        status: "running",
        current_step: "starting",
        steps_done: 0,
        steps_total: 7,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return run;
  });

export const finishHolyGrailRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ runId: z.string().uuid(), status: z.enum(["done", "failed"]), error: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await updateRun(context.supabase, data.runId, { status: data.status, error: data.error ?? null, current_step: null });
    return { ok: true };
  });

// ---------- 1. Opportunity (RFP-based) ----------
const OpportunitySchema = z.object({
  engagementId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  fileName: z.string().min(1).max(240),
  text: z.preprocess(
    (v) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : v),
    z.string().min(20).max(MAX_TEXT),
  ),
  runId: z.string().uuid().optional(),
});

const OPPORTUNITY_SYSTEM = `You are an expert proposal strategist analyzing a healthcare/Medicaid RFP.
Extract OPPORTUNITY INTELLIGENCE — the basic facts about this procurement. Return ONLY JSON:
{
  "summary": string,
  "program_name": string,
  "state": string,
  "agency": string,
  "population_served": string,
  "enrollment": string,
  "budget": string,
  "incumbents": [string],
  "contract_term": string,
  "regions": [string],
  "submission_due_date": string,
  "submission_due_time": string,
  "timeline": [{"label": string, "date": string}],
  "evaluation_criteria": [{"criterion": string, "weight": string, "notes": string}],
  "mandatory_requirements": [string],
  "scored_requirements": [string],
  "procurement_vehicle": string,
  "historical_awards": [string],
  "page_limits": string,
  "submission_format": string,
  "win_factors": [string],
  "risks": [string],
  "open_questions": [string]
}
Omit a key entirely if no information is available. Quote requirement numbers/section refs where possible.
submission_due_date MUST be ISO yyyy-mm-dd and only when the RFP explicitly states a final proposal submission deadline — never guess.`;

export const analyzeOpportunity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => OpportunitySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertLeadership(supabase, userId, data.engagementId);
    if (data.runId) await updateRun(supabase, data.runId, { current_step: "opportunity" });

    const parsed = await callAi(OPPORTUNITY_SYSTEM, `File: ${data.fileName}\n\nRFP TEXT:\n${data.text}`);
    await saveSection(
      supabase,
      data.engagementId,
      "holy_grail_opportunity",
      data.fileName,
      parsed,
      data.documentId ? [`intel_documents:${data.documentId}`] : [],
      0.9,
    );

    // Push parsed RFP text into the embedding queue in ~2k char chunks so
    // Ask Athena can cite the actual RFP, not just the summary.
    if (data.documentId) {
      const CHUNK = 2000;
      const chunks: { source_table: string; source_id: string; engagement_id: string; content_text: string; priority: number }[] = [];
      for (let i = 0; i < data.text.length; i += CHUNK) {
        const piece = data.text.slice(i, i + CHUNK).trim();
        if (!piece) continue;
        chunks.push({
          source_table: "intel_documents",
          source_id: data.documentId,
          engagement_id: data.engagementId,
          content_text: `[${data.fileName} • chunk ${Math.floor(i / CHUNK) + 1}]\n${piece}`,
          priority: 4,
        });
      }
      // Per-chunk rows would collide on the (source_table, source_id) unique key,
      // so collapse into one queued row containing the full text — the embedding
      // worker chunks downstream.
      if (chunks.length) {
        await supabase
          .from("embedding_queue")
          .upsert(
            {
              source_table: "intel_documents",
              source_id: data.documentId,
              engagement_id: data.engagementId,
              content_text: `[RFP: ${data.fileName}]\n${data.text}`,
              priority: 4,
              processed_at: null,
              attempts: 0,
              queued_at: new Date().toISOString(),
            },
            { onConflict: "source_table,source_id" },
          );
      }
    }

    if (data.runId) await updateRun(supabase, data.runId, { steps_done: 1 });
    return { ok: true };
  });

// ---------- 2-7. Web-research categories ----------

type CategoryDef = {
  key: "market" | "political" | "competitive" | "customer" | "provider" | "community";
  label: string;
  storageKey: string;
  buildQuery: (ctx: any) => string;
  searchLimit: number;
  system: string;
};

const CATS: Record<string, CategoryDef> = {
  market: {
    key: "market",
    label: "Market Intelligence",
    storageKey: "holy_grail_market",
    searchLimit: 6,
    buildQuery: (ctx) => {
      const state = ctx.eng.state ?? ctx.cfg.state ?? "";
      const market = ctx.eng.market ?? ctx.cfg.market ?? "Medicaid managed care";
      return `${state} ${market} MCO market share enrollment trends ${new Date().getFullYear()}`;
    },
    system: `You are a Medicaid market analyst. Use the engagement context + search results to extract MARKET INTELLIGENCE. Return ONLY JSON:
{
  "program_structure": string,
  "mco_landscape": [string],
  "market_share": [{"plan": string, "share": string, "notes": string}],
  "enrollment_trends": string,
  "population_change": string,
  "fiscal_outlook": string,
  "managed_care_maturity": string,
  "recent_legislation": [string],
  "provider_market_dynamics": string,
  "summary": string,
  "confidence": number
}
Confidence: 0.0 to 1.0 based on how well sources support claims. Omit keys with no info.`,
  },
  political: {
    key: "political",
    label: "Political Intelligence",
    storageKey: "holy_grail_political",
    searchLimit: 6,
    buildQuery: (ctx) => {
      const state = ctx.eng.state ?? ctx.cfg.state ?? "";
      return `${state} Medicaid director governor priorities legislative hearings budget ${new Date().getFullYear()}`;
    },
    system: `You are a state-government political analyst. Extract POLITICAL INTELLIGENCE from the context and sources. Return ONLY JSON:
{
  "governor_priorities": [string],
  "medicaid_director_priorities": [string],
  "leadership_changes": [string],
  "legislative_pressures": [string],
  "budget_pressures": [string],
  "advocacy_influence": [string],
  "provider_association_influence": [string],
  "election_considerations": string,
  "inferred_political_problem": string,
  "summary": string,
  "confidence": number
}
"inferred_political_problem" answers: "What political problem is the state trying to solve with this procurement?"`,
  },
  competitive: {
    key: "competitive",
    label: "Competitive Intelligence",
    storageKey: "holy_grail_competitive",
    searchLimit: 8,
    buildQuery: (ctx) => {
      const state = ctx.eng.state ?? ctx.cfg.state ?? "";
      const competitors = [ctx.cfg.incumbent, ...(ctx.cfg.competitors ?? [])].filter(Boolean).slice(0, 4).join(" OR ");
      return competitors
        ? `${competitors} ${state} Medicaid contract performance ${new Date().getFullYear()}`
        : `${state} Medicaid MCO contract awards performance issues ${new Date().getFullYear()}`;
    },
    system: `You are a competitive intelligence analyst for Medicaid procurements. For each likely bidder, extract strengths, weaknesses, and recent activity. Return ONLY JSON:
{
  "likely_bidders": [
    {
      "name": string,
      "strengths": [string],
      "weaknesses": [string],
      "recent_wins": [string],
      "recent_losses": [string],
      "local_footprint": string,
      "provider_relationships": string,
      "community_relationships": string,
      "state_reputation": string,
      "executive_relationships": string,
      "known_performance_issues": [string]
    }
  ],
  "likely_winner_if_nothing_changes": string,
  "summary": string,
  "confidence": number
}`,
  },
  customer: {
    key: "customer",
    label: "Customer Intelligence",
    storageKey: "holy_grail_customer",
    searchLimit: 6,
    buildQuery: (ctx) => {
      const state = ctx.eng.state ?? ctx.cfg.state ?? "";
      return `${state} Medicaid audit report OIG legislative hearing complaints advisory committee ${new Date().getFullYear()}`;
    },
    system: `You are a strategist mapping the STATE'S pain (the customer). Extract what the state is embarrassed about, criticized for, or trying to fix. Return ONLY JSON:
{
  "keeps_them_up_at_night": [string],
  "embarrassments": [string],
  "auditor_criticisms": [string],
  "legislator_criticisms": [string],
  "advocate_criticisms": [string],
  "stated_fixes": [string],
  "inferred_real_problem": string,
  "summary": string,
  "confidence": number
}
"inferred_real_problem" answers: "What problem are they actually buying a solution for?"`,
  },
  provider: {
    key: "provider",
    label: "Provider Ecosystem Intelligence",
    storageKey: "holy_grail_provider",
    searchLimit: 6,
    buildQuery: (ctx) => {
      const state = ctx.eng.state ?? ctx.cfg.state ?? "";
      return `${state} Medicaid provider associations hospital systems FQHC behavioral health HCBS LTSS concerns`;
    },
    system: `You are mapping the provider ecosystem for this Medicaid program. Return ONLY JSON:
{
  "hospital_systems": [string],
  "fqhcs": [string],
  "behavioral_health": [string],
  "hcbs": [string],
  "idd": [string],
  "ltss": [string],
  "associations": [string],
  "happy": [string],
  "angry": [string],
  "ignored": [string],
  "influential": [string],
  "summary": string,
  "confidence": number
}
"happy/angry/ignored/influential" lists are provider groups in those buckets and a short reason.`,
  },
  community: {
    key: "community",
    label: "Community Intelligence",
    storageKey: "holy_grail_community",
    searchLimit: 6,
    buildQuery: (ctx) => {
      const state = ctx.eng.state ?? ctx.cfg.state ?? "";
      return `${state} Medicaid disability advocates aging family caregivers behavioral health coalition tribal community complaints`;
    },
    system: `You map the community advocacy landscape around this Medicaid program. Return ONLY JSON:
{
  "disability_advocates": [string],
  "aging_advocates": [string],
  "family_orgs": [string],
  "child_welfare": [string],
  "behavioral_coalitions": [string],
  "provider_coalitions": [string],
  "tribal_orgs": [string],
  "community_leaders": [string],
  "complaints": [string],
  "frustrations": [string],
  "gaps": [string],
  "emerging_needs": [string],
  "summary": string,
  "confidence": number
}`,
  },
};

const CategorySchema = z.object({
  engagementId: z.string().uuid(),
  category: z.enum(["market", "political", "competitive", "customer", "provider", "community"]),
  runId: z.string().uuid().optional(),
  force: z.boolean().optional(),
});

export const analyzeCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CategorySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertLeadership(supabase, userId, data.engagementId);

    const def = CATS[data.category];
    if (!def) throw new Error(`Unknown category: ${data.category}`);

    if (data.runId) await updateRun(supabase, data.runId, { current_step: def.key });

    const ctx = await loadEngagementContext(supabase, data.engagementId);
    const query = def.buildQuery(ctx);
    const research = await researchWithCache(supabase, def.key, query, !!data.force, def.searchLimit);

    const userPrompt = `ENGAGEMENT CONTEXT:
${ctxLine(ctx)}

RFP OPPORTUNITY SUMMARY (from prior step):
${ctx.opportunity?.summary ?? "(not yet analyzed)"}

SEARCH QUERY USED: "${query}"

SOURCES:
${snippetsToPrompt(research.snippets)}

Now produce the JSON.`;

    const parsed = await callAi(def.system, userPrompt, "google/gemini-2.5-flash");
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

    await saveSection(
      supabase,
      data.engagementId,
      def.storageKey,
      def.label,
      parsed,
      research.urls,
      confidence,
    );

    if (data.runId) {
      const { data: cur } = await supabase
        .from("holy_grail_runs")
        .select("steps_done")
        .eq("id", data.runId)
        .maybeSingle();
      await updateRun(supabase, data.runId, { steps_done: (cur?.steps_done ?? 0) + 1 });
    }
    return { ok: true, sources: research.urls.length, confidence };
  });

// ---------- Executive Summary across all Holy Grail categories ----------
export const generateHolyGrailSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      engagementId: z.string().uuid(),
      style: z.enum(["executive", "brief", "actions"]).default("executive"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Any member of the engagement can request a summary
    const { data: member } = await supabase
      .from("engagement_members")
      .select("role")
      .eq("engagement_id", data.engagementId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!member) throw new Error("You must be a member of this engagement.");

    const { data: rows } = await supabase
      .from("engagement_research")
      .select("category, title, content, confidence_score, updated_at")
      .eq("engagement_id", data.engagementId)
      .like("category", "holy_grail%");

    const sections = (rows ?? []).filter((r: any) => r.category !== "holy_grail_summary");
    if (!sections.length) throw new Error("No Holy Grail intelligence to summarize yet.");

    const ctx = await loadEngagementContext(supabase, data.engagementId);

    const lengthHint =
      data.style === "brief"
        ? "Keep the headline + 5 bullets maximum. Total under 180 words."
        : data.style === "actions"
          ? "Focus heavily on next_actions (8-12 concrete, owner-ready items). Other fields stay short."
          : "Executive-grade. Tight prose, no filler. ~300-450 words total across all fields.";

    const system = `You are the chief strategist for a state-government bid pursuit. Synthesize multiple intelligence categories into ONE executive summary the founder can read in 90 seconds.

Return STRICT JSON:
{
  "headline": "one-sentence verdict on whether/how to pursue",
  "bid_recommendation": "BID | NO-BID | BID-WITH-CONDITIONS",
  "confidence": 0.0-1.0,
  "win_probability": "low | medium | high",
  "key_findings": [ "3-6 short bullets that cut across categories" ],
  "win_themes": [ "3-5 themes we should lead with" ],
  "top_risks": [ "3-5 risks ranked by impact" ],
  "competitive_picture": "2-3 sentences on who wins if nothing changes and why",
  "political_picture": "2-3 sentences on the political/agency dynamics",
  "customer_picture": "2-3 sentences on what the customer actually wants",
  "next_actions": [ "concrete, owner-ready next steps" ],
  "open_questions": [ "what we still need to learn" ]
}

${lengthHint} Cite nothing — this is synthesis. Be specific, not generic.`;

    const sectionDump = sections
      .map((r: any) => {
        const c = r.content ?? {};
        const { _sources, ...rest } = c;
        return `## ${r.title ?? r.category} (confidence ${Math.round((r.confidence_score ?? 0) * 100)}%)\n${JSON.stringify(rest).slice(0, 8000)}`;
      })
      .join("\n\n");

    const userPrompt = `ENGAGEMENT CONTEXT:\n${ctxLine(ctx)}\n\nINTELLIGENCE SECTIONS:\n${sectionDump.slice(0, MAX_TEXT)}\n\nProduce the JSON now.`;

    const parsed = await callAi(system, userPrompt, "google/gemini-2.5-flash");
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.6;

    await saveSection(
      supabase,
      data.engagementId,
      "holy_grail_summary",
      "Executive Summary",
      { ...parsed, _style: data.style, _generated_at: new Date().toISOString() },
      [],
      confidence,
    );

    return { ok: true, summary: parsed };
  });
