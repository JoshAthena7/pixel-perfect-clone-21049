/**
 * ATLAS Mission Moments — Inspiration and Trivia for the Team Pulse card.
 *
 * Reads from atlas_mission_moments for today; if missing OR stale-shape,
 * regenerates via Lovable AI Gateway and persists via the admin client.
 *
 * - Inspiration = quote about leadership and kindness (general, not RFP).
 * - Trivia = fun fact about the U.S. state the mission is in.
 *
 * Prior moments (last 60 days) are passed to the LLM as an exclusion list
 * so successive iterations don't repeat the same quote/question.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

async function callIris(system: string, user: string): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("IRIS is not configured.");
  const res = await withAICircuit(async () => {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
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

function parseJson<T = unknown>(s: string): T | null {
  const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(cleaned) as T; } catch { /* fall through */ }
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(cleaned.slice(a, b + 1)) as T; } catch { return null; }
}

const INSPIRATION_SYS = `You are IRIS, the intelligence co-pilot for Athena Strategy Group. Share ONE real quote about LEADERSHIP and KINDNESS — from a thinker, leader, writer, athlete, public servant, or teacher. The pairing of leadership AND kindness is the point: people who led with care, courage, and humanity. Voice of a trusted colleague at 7am — never motivational-poster, never corporate wellness. Do NOT reference any specific RFP, client, mission, deadline, or compliance work. Return ONLY valid JSON, no markdown, no backticks.`;

const TRIVIA_SYS = `You are IRIS, the intelligence co-pilot for Athena Strategy Group. Generate one genuinely interesting FUN FACT trivia question about the U.S. state given — its history, geography, culture, food, landmarks, notable people, or quirky records. NOT about the RFP, Medicaid, procurement, or compliance. The kind of thing a curious colleague would enjoy hearing at the start of the day. Return ONLY valid JSON, no markdown, no backticks.`;

function inspirationLooksStale(c: any): boolean {
  if (!c || typeof c !== "object") return true;
  if (typeof c.quote !== "string" || !c.quote.trim()) return true;
  // Old shape used to reference RFP / mission details inside `context`.
  const blob = JSON.stringify(c).toLowerCase();
  return /\b(rfp|medicaid|procurement|proposal|bidder|deadline|compliance)\b/.test(blob);
}

function triviaLooksStale(c: any): boolean {
  if (!c || typeof c !== "object") return true;
  if (typeof c.question !== "string" || !Array.isArray(c.options)) return true;
  const blob = `${c.question} ${c.explanation ?? ""}`.toLowerCase();
  return /\b(rfp|medicaid|procurement|proposal|bidder|compliance)\b/.test(blob);
}

/** Read-or-generate a mission moment for today. Returns the persisted row. */
export const ensureMissionMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    momentType: z.enum(["inspiration", "trivia"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId, momentType } = data;
    const today = new Date().toISOString().slice(0, 10);

    // 1) Check today's cache; if stale-shape, regenerate.
    const { data: existing } = await supabase
      .from("atlas_mission_moments")
      .select("id, moment_type, content, active_date, created_at")
      .eq("mission_id", missionId)
      .eq("moment_type", momentType)
      .eq("active_date", today)
      .maybeSingle();

    const isStale =
      existing &&
      (momentType === "inspiration"
        ? inspirationLooksStale(existing.content)
        : triviaLooksStale(existing.content));
    if (existing && !isStale) return existing;

    // 2) Look up mission state + prior moments (exclusion list).
    const [{ data: mission }, { data: prior }] = await Promise.all([
      supabase.from("missions").select("state, state_code").eq("id", missionId).maybeSingle(),
      supabase
        .from("atlas_mission_moments")
        .select("content, active_date")
        .eq("mission_id", missionId)
        .eq("moment_type", momentType)
        .order("active_date", { ascending: false })
        .limit(60),
    ]);
    const state = mission?.state ?? mission?.state_code ?? "—";

    // 3) Generate via AI, telling it what to avoid.
    let content: Record<string, unknown> | null = null;
    if (momentType === "inspiration") {
      const priorQuotes = (prior ?? [])
        .map((r: any) => {
          const q = r?.content?.quote;
          const a = r?.content?.attribution;
          return q ? `- "${String(q).slice(0, 140)}"${a ? ` — ${a}` : ""}` : null;
        })
        .filter(Boolean)
        .slice(0, 40)
        .join("\n");

      const userMsg = `Generate ONE real quote about LEADERSHIP and KINDNESS. The author should be a real person (leader, writer, teacher, athlete, public servant, etc.). The quote must touch both leading others AND kindness/humanity. Do NOT reference any specific RFP, client, mission, deadline, or procurement.

Do NOT repeat any of these prior quotes from earlier iterations:
${priorQuotes || "(none yet)"}

Return JSON:
{
  "quote": "the quote, max 200 chars",
  "attribution": "the real author/source",
  "context": "max 120 chars — why this idea matters today"
}`;
      const raw = await callIris(INSPIRATION_SYS, userMsg);
      content = parseJson(raw);
    } else {
      const priorQuestions = (prior ?? [])
        .map((r: any) => (r?.content?.question ? `- ${String(r.content.question).slice(0, 160)}` : null))
        .filter(Boolean)
        .slice(0, 40)
        .join("\n");

      const userMsg = `State: ${state}

Generate ONE FUN FACT trivia question about this U.S. state — history, geography, culture, food, landmarks, notable people, weird records, etc. NOT about the RFP, Medicaid, procurement, or compliance.

Do NOT repeat any of these prior questions from earlier iterations:
${priorQuestions || "(none yet)"}

Return JSON:
{
  "question": "the trivia question",
  "options": ["A","B","C","D"],
  "correct_index": 0,
  "explanation": "max 250 chars — the interesting story behind the answer"
}`;
      const raw = await callIris(TRIVIA_SYS, userMsg);
      content = parseJson(raw);
    }

    if (!content) {
      throw new Error("IRIS returned an unreadable moment. Try again shortly.");
    }

    // 4) Persist via admin (RLS denies authenticated INSERT). UPSERT on the
    // unique (mission, type, date) index so concurrent reads/regenerates are safe.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("atlas_mission_moments")
      .upsert({
        mission_id: missionId,
        moment_type: momentType,
        content: content as any,
        active_date: today,
        generated_by: "iris",
      }, { onConflict: "mission_id,moment_type,active_date" })
      .select("id, moment_type, content, active_date, created_at")
      .single();
    if (insErr) throw insErr;
    return inserted;
  });
