/**
 * ATLAS Writer's Block — "Stuck?" tool that gives a writer a concrete way in.
 *
 * Persists every session to atlas_writer_block_sessions so we can learn
 * which kinds of blocks IRIS is actually unsticking.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const BLOCK = z.enum([
  "dont_know_where_to_start",
  "have_ideas_cant_organize",
  "sounds_generic",
  "know_what_not_how",
]);

async function callIrisText(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
    return r;
  });
  if (res.status === 402) throw new Error("Out of AI credits.");
  if (res.status === 429) throw new Error("IRIS is rate limited. Try again shortly.");
  if (!res.ok) throw new Error(`IRIS gateway returned ${res.status}.`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

function flatten(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(" | ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return o.title || o.theme || o.text ? String(o.title ?? o.theme ?? o.text) : JSON.stringify(v);
  }
  return String(v);
}

const SYSTEM = `You are IRIS, intelligence co-pilot for Athena Strategy Group. A writer is stuck on a Medicaid proposal question and needs an immediately actionable way in — not a pep talk. Direct, specific to this mission. No corporate jargon. Plain prose where natural; use numbered lists only when the writer asked for an outline.`;

export const unstickMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    questionId: z.string().uuid(),
    blockType: BLOCK,
    freeText: z.string().max(150).optional(),
    sessionId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { missionId, questionId, blockType, freeText, sessionId } = data;

    const [qRes, oRes] = await Promise.all([
      supabase.from("mission_questions")
        .select("question_number, question_text, evaluation_weight, iris_decoded_intent")
        .eq("id", questionId).maybeSingle(),
      supabase.from("oracle_engagement_config")
        .select("win_themes, central_claim").eq("mission_id", missionId).maybeSingle(),
    ]);
    const q: any = qRes.data ?? {};
    const o: any = oRes.data ?? {};

    const head = `Question ${q.question_number ?? "?"} (weight: ${q.evaluation_weight ?? "—"}): ${q.question_text ?? ""}
IRIS decoded intent: ${q.iris_decoded_intent ?? "(none)"}
Win themes: ${flatten(o.win_themes) || "(none)"}
Central claim: ${o.central_claim ?? "(none)"}
Blocker: ${blockType}
Writer context: ${freeText || "(none)"}`;

    let task = "";
    switch (blockType) {
      case "dont_know_where_to_start":
        task = `Give (1) one strong first sentence the writer can use verbatim, then (2) a 4-point outline specific to this question and mission. Concrete and specific — not generic.`;
        break;
      case "have_ideas_cant_organize":
        task = `Give 4-5 section headers with one sentence each explaining what goes there. Specific to the eval criteria and this mission.`;
        break;
      case "sounds_generic":
        task = `Show 3 specific ways to make this answer unique to this mission. Name what generic sounds like vs specific. Include one example sentence transformation.`;
        break;
      case "know_what_not_how":
        task = `Write the opening paragraph — 3-4 sentences, professional proposal voice, specific to this question and mission. A starting point the writer can build from.`;
        break;
    }

    const text = await callIrisText(SYSTEM, `${head}\n\n${task}\nMax 300 words. Direct and immediately actionable.`);
    if (!text) throw new Error("IRIS returned an empty response. Try again shortly.");

    // Persist the session
    let finalSessionId = sessionId ?? null;
    if (!finalSessionId) {
      const { data: row, error } = await supabase
        .from("atlas_writer_block_sessions")
        .insert({
          mission_id: missionId,
          user_id: userId,
          question_id: questionId,
          block_type: blockType,
          iris_response: { text, free_text: freeText ?? null } as any,
        })
        .select("id")
        .single();
      if (error) console.warn("[unstickMe] insert session failed", error.message);
      finalSessionId = row?.id ?? null;
    } else {
      await supabase
        .from("atlas_writer_block_sessions")
        .update({ iris_response: { text, free_text: freeText ?? null } as any })
        .eq("id", finalSessionId);
    }

    return { text, sessionId: finalSessionId };
  });

export const markBlockSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    sessionId: z.string().uuid(),
    wasHelpful: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("atlas_writer_block_sessions")
      .update({ was_helpful: data.wasHelpful })
      .eq("id", data.sessionId);
    if (error) throw error;
    return { ok: true };
  });
