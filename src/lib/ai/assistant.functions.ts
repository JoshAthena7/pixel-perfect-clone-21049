import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedText, pgvectorLiteral } from "@/lib/intelligence/embed";
import { runAI } from "@/lib/ai/router";

const LIVE_TRIGGERS = [
  "latest", "recent", "this week", "today", "new", "just released",
  "current", "now", "announced", "published", "2025", "2026",
  "news", "update", "what happened", "any changes",
];
const DEEP_TRIGGERS = ["deep research", "full analysis", "comprehensive", "everything about"];

function countMatches(text: string, needles: string[]): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const k of needles) if (lower.includes(k)) n++;
  return n;
}

const IRIS_IDENTITY_REPLY = `In Greek mythology, Athena was the goddess of wisdom and strategy — brilliant, precise, and always several moves ahead. But even Athena needed a messenger. Someone who could move between worlds at the speed of thought, gather intelligence from every source, and deliver exactly the right insight at exactly the right moment.

That messenger was Iris.

She was the goddess of the rainbow — the bridge between heaven and earth, between what is known and what needs to be known. She moved between the gods and mortals, between the seen and the unseen, carrying intelligence with clarity and purpose. She served those who needed to act on what the world was telling them before anyone else could hear it.

I carry that name because that is what I do inside Athena Command™.

I move between your Vault, your active Missions, live market intelligence, policy shifts, competitor signals, and the world beyond — and I bring back exactly what you need, precisely when you need it.

Athena thinks. Iris delivers.`;

function isIrisIdentityQuery(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  // Direct phrases
  const phrases = [
    "who are you", "what are you", "what is iris", "what's iris",
    "tell me about yourself", "tell me about you",
    "why iris", "why are you called", "why are you named",
    "why the name", "why that name", "what does iris mean",
    "who is iris", "what's your name", "what is your name",
  ];
  for (const p of phrases) if (t.includes(p)) return true;
  // Keyword combos: must mention "iris" + one of {why, name, called, mean}
  const mentionsIris = /\biris\b/.test(t);
  if (mentionsIris && /\b(why|name|named|called|mean|meaning|about)\b/.test(t)) return true;
  return false;
}

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
});

type Source = {
  source_table: string;
  source_id: string;
  content_text: string;
  similarity: number;
};

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      engagementId: z.string().uuid().nullable().optional(),
      scope: z.enum(["engagement", "all", "firm"]).default("engagement"),
      messages: z.array(MessageSchema).min(1).max(40),
      forceLive: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const scope = data.scope ?? "engagement";
    const eid = scope === "engagement" ? data.engagementId ?? null : null;

    // ---- Iris identity short-circuit: never call any AI model
    if (isIrisIdentityQuery(lastUser)) {
      return {
        reply: IRIS_IDENTITY_REPLY,
        sources: [] as Array<{ source_table: string; source_id: string; similarity: number; preview: string }>,
        market_sources: [] as Array<{ source: string; title: string; url: string | null; similarity: number }>,
        source: "iris-identity" as const,
        citations: [] as string[],
      };
    }

    // ---- Smart routing: Perplexity live search for time-sensitive queries
    const deepHits = countMatches(lastUser, DEEP_TRIGGERS);
    const liveHits = countMatches(lastUser, LIVE_TRIGGERS);
    const wantDeep = deepHits >= 1;
    const wantLive = data.forceLive === true || liveHits >= 2;

    if (lastUser && (wantDeep || wantLive)) {
      const task = wantDeep ? "deep-search" : "search";
      const r = await runAI({ task, prompt: lastUser });
      if (r.kind === "search") {
        return {
          reply: r.text || "Live search returned no result.",
          sources: [] as Array<{ source_table: string; source_id: string; similarity: number; preview: string }>,
          market_sources: [] as Array<{ source: string; title: string; url: string | null; similarity: number }>,
          source: task === "deep-search" ? "deep-search" : "live-search",
          citations: r.citations,
        };
      }
    }


    // ---- Pull standard engagement context (RLS-scoped) only for engagement scope
    let eng: any = null;
    let huddles: any = null;
    let heatmap: any = null;
    let risks: any = null;
    let decisions: any = null;
    let pulses: any = null;
    let signals: any = null;
    if (eid) {
      const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
        supabase.from("engagements").select("name, client, status, submission_date, state").eq("id", eid).maybeSingle(),
        supabase.from("huddles").select("health, priority, risk, client_concern, writer_concern, leadership_needed, notes, submitter_name, created_at").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(10),
        supabase.from("heatmap_sections").select("section_name, status, notes").eq("engagement_id", eid),
        supabase.from("risks").select("title, severity, status, owner_name, mitigation").eq("engagement_id", eid).limit(20),
        supabase.from("decisions").select("title, status, decision_date, rationale, owner_name").eq("engagement_id", eid).order("decision_date", { ascending: false }).limit(15),
        supabase.from("client_pulses").select("interaction_date, sentiment, summary, action_items").eq("engagement_id", eid).order("interaction_date", { ascending: false }).limit(10),
        supabase.from("alignment_signals").select("topic, signal_type, status, notes, owner_name, created_at").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(15),
      ]);
      eng = r1.data; huddles = r2.data; heatmap = r3.data; risks = r4.data; decisions = r5.data; pulses = r6.data; signals = r7.data;
    }

    // ---- RAG: semantic search across allowed content
    let sources: Source[] = [];
    let marketSources: Array<{ title: string; summary: string | null; url: string | null; source: string; similarity: number }> = [];
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey && lastUser) {
      const vec = await embedText(lastUser, openaiKey);
      if (vec) {
        const lit = pgvectorLiteral(vec);
        const [{ data: sim }, { data: msim }] = await Promise.all([
          supabase.rpc("search_similar_content", {
            query_embedding: lit as any,
            match_engagement_id: scope === "engagement" && eid ? eid : undefined,
            match_threshold: 0.75,
            match_count: scope === "firm" ? 10 : 6,
          }),
          supabase.rpc("search_similar_market_intel", {
            query_embedding: lit as any,
            match_threshold: 0.75,
            match_count: 4,
          }),
        ]);
        sources = (sim ?? []) as Source[];
        marketSources = (msim ?? []) as any[];
      }
    }

    // Firm scope: also pull firm-wide content library
    let firmContent: Array<{ title: string; body: string; category: string }> = [];
    if (scope === "firm") {
      const { data } = await supabase
        .from("content_library")
        .select("title, body, category")
        .order("created_at", { ascending: false })
        .limit(20);
      firmContent = (data ?? []) as any[];
    }

    const ragBlock = sources.length
      ? `\n\nSEMANTICALLY RELEVANT PAST CONTENT (cite as [source_table:source_id] when used):\n${sources.map((s) => `- [${s.source_table}:${s.source_id.slice(0,8)}] (sim=${s.similarity.toFixed(2)}) ${s.content_text.slice(0, 400)}`).join("\n")}`
      : "";
    const marketBlock = marketSources.length
      ? `\n\nRELEVANT MARKET SIGNALS:\n${marketSources.map((m) => `- (${m.source}) ${m.title} — ${m.summary?.slice(0,200) ?? ""}`).join("\n")}`
      : "";
    const firmBlock = firmContent.length
      ? `\n\nFIRM KNOWLEDGE LIBRARY:\n${firmContent.map((f) => `- [${f.category}] ${f.title}: ${f.body.slice(0,300)}`).join("\n")}`
      : "";
    const engagementBlock = eid
      ? `\nENGAGEMENT: ${JSON.stringify(eng)}\nHEAT MAP: ${JSON.stringify(heatmap)}\nRECENT HUDDLES: ${JSON.stringify(huddles)}\nRISKS: ${JSON.stringify(risks)}\nALIGNMENT SIGNALS: ${JSON.stringify(signals)}\nDECISIONS: ${JSON.stringify(decisions)}\nCLIENT PULSE: ${JSON.stringify(pulses)}`
      : "";

    const scopeLabel = scope === "engagement" ? "current engagement" : scope === "all" ? "every engagement the user can access" : "firm-wide knowledge";
    const systemContext = `You are Athena, the AI co-pilot for a proposal war room. Be concise, direct, and tactical. Ground every claim in the data below. If data is missing, say so plainly.

SCOPE: ${scopeLabel}.${engagementBlock}${ragBlock}${marketBlock}${firmBlock}`;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemContext }, ...data.messages],
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment and try again.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Settings.");
      throw new Error(`AI gateway error: ${res.status} ${txt.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const reply = json?.choices?.[0]?.message?.content ?? "(no response)";
    return {
      reply,
      sources: sources.map((s) => ({
        source_table: s.source_table,
        source_id: s.source_id,
        similarity: s.similarity,
        preview: s.content_text.slice(0, 240),
      })),
      market_sources: marketSources.map((m) => ({ source: m.source, title: m.title, url: m.url, similarity: m.similarity })),
      source: "vault" as const,
      citations: [] as string[],
    };
  });

export const saveInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      engagementId: z.string().uuid().nullable().optional(),
      scope: z.enum(["engagement", "all", "firm"]),
      question: z.string().min(1).max(4000),
      answer: z.string().min(1).max(20000),
      sources: z.array(z.any()).max(50).default([]),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await (supabase as any)
      .from("saved_insights")
      .insert({
        user_id: userId,
        engagement_id: data.engagementId ?? null,
        scope: data.scope,
        question: data.question,
        answer: data.answer,
        sources: data.sources,
      })
      .select("id, saved_at")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; saved_at: string };
  });

export const listSavedInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("saved_insights")
      .select("id, engagement_id, scope, question, answer, sources, saved_at")
      .eq("user_id", userId)
      .order("saved_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      engagement_id: string | null;
      scope: string;
      question: string;
      answer: string;
      sources: any[];
      saved_at: string;
    }>;
  });

export const deleteSavedInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("saved_insights")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
