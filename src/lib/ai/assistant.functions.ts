import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { embedText, pgvectorLiteral } from "@/lib/intelligence/embed";

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
      engagementId: z.string().uuid(),
      messages: z.array(MessageSchema).min(1).max(40),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const lastUser = [...data.messages].reverse().find((m) => m.role === "user")?.content ?? "";

    // ---- Pull standard engagement context (RLS-scoped)
    const [{ data: eng }, { data: huddles }, { data: heatmap }, { data: risks }, { data: decisions }, { data: pulses }] =
      await Promise.all([
        supabase.from("engagements").select("name, client, status, submission_date, state").eq("id", data.engagementId).maybeSingle(),
        supabase.from("huddles").select("health, priority, risk, client_concern, writer_concern, needs_leadership, notes, submitter_name, created_at").eq("engagement_id", data.engagementId).order("created_at", { ascending: false }).limit(10),
        supabase.from("heatmap_sections").select("section_name, status, owner_name, notes").eq("engagement_id", data.engagementId),
        supabase.from("risks").select("title, severity, status, owner_name, mitigation").eq("engagement_id", data.engagementId).limit(20),
        supabase.from("decisions").select("title, status, decision_date, rationale, owner_name").eq("engagement_id", data.engagementId).order("decision_date", { ascending: false }).limit(15),
        supabase.from("client_pulses").select("interaction_date, sentiment, summary, action_items").eq("engagement_id", data.engagementId).order("interaction_date", { ascending: false }).limit(10),
      ]);

    // ---- RAG: pull semantically similar content + market intel based on the last user question
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
            match_engagement_id: undefined, // search across all engagements the user can see
            match_threshold: 0.75,
            match_count: 6,
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

    const ragBlock = sources.length
      ? `\n\nSEMANTICALLY RELEVANT PAST CONTENT (cite as [source_table:source_id] when used):\n${sources.map((s) => `- [${s.source_table}:${s.source_id.slice(0,8)}] (sim=${s.similarity.toFixed(2)}) ${s.content_text.slice(0, 400)}`).join("\n")}`
      : "";
    const marketBlock = marketSources.length
      ? `\n\nRELEVANT MARKET SIGNALS:\n${marketSources.map((m) => `- (${m.source}) ${m.title} — ${m.summary?.slice(0,200) ?? ""}`).join("\n")}`
      : "";

    const systemContext = `You are Athena, the AI co-pilot for a proposal war room. Be concise, direct, and tactical. Ground every claim in the data below. If data is missing, say so plainly.

ENGAGEMENT: ${JSON.stringify(eng)}
HEAT MAP: ${JSON.stringify(heatmap)}
RECENT HUDDLES: ${JSON.stringify(huddles)}
RISKS: ${JSON.stringify(risks)}
DECISIONS: ${JSON.stringify(decisions)}
CLIENT PULSE: ${JSON.stringify(pulses)}${ragBlock}${marketBlock}`;

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
    };
  });
