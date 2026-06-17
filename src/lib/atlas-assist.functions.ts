/**
 * ATLAS Assist Bar — 4-tool IRIS coach attached to each expanded question.
 * Decode | Win Angle | Evidence | Watch Out.
 *
 * Returns plain text. Component caches per-session by (questionId, tool) so
 * switching away and back never re-bills the gateway.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";
import { buildMissionContext, serializeContextForPrompt } from "@/lib/iris/build-mission-context";

const TOOL = z.enum(["decode", "win_angle", "evidence", "watch_out"]);
const MODE = z.enum(["initial", "regenerate", "go_deeper"]);

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

const SYSTEM = `You are IRIS, intelligence co-pilot for Athena Strategy Group. Athena wins complex Medicaid procurements with small expert teams. Speak directly — no corporate jargon, no hedging, no "in summary". Specific to this mission. Plain prose unless asked for a list.`;

function flatten(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(flatten).filter(Boolean).join(" | ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return o.title || o.name || o.theme || o.text
      ? String(o.title ?? o.name ?? o.theme ?? o.text)
      : JSON.stringify(v);
  }
  return String(v);
}

export const runAssistTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    questionId: z.string().uuid(),
    tool: TOOL,
    mode: MODE.default("initial"),
    priorResponse: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId, questionId, tool, mode, priorResponse } = data;

    const [qRes, mRes, oRes, compRes] = await Promise.all([
      supabase.from("mission_questions")
        .select("question_number, question_text, evaluation_weight, iris_decoded_intent")
        .eq("id", questionId).maybeSingle(),
      supabase.from("missions").select("name, state, program_type").eq("id", missionId).maybeSingle(),
      supabase.from("oracle_engagement_config")
        .select("win_themes, central_claim, discriminators, proof_points, top_risks, north_star, competitors")
        .eq("mission_id", missionId).maybeSingle(),
      supabase.from("competitor_profiles").select("organization_name").eq("mission_id", missionId).limit(10),
    ]);

    const q: any = qRes.data ?? {};
    const m: any = mRes.data ?? {};
    const o: any = oRes.data ?? {};
    const competitorNames = (compRes.data ?? []).map((c: any) => c.organization_name).filter(Boolean);
    const oecCompetitors = flatten(o.competitors);
    const weight = q.evaluation_weight ?? "—";

    const base = `Mission: ${m.name ?? "—"} (${m.state ?? "—"}, ${m.program_type ?? "—"})
Question ${q.question_number ?? "?"} (weight: ${weight}): ${q.question_text ?? ""}
IRIS decoded intent: ${q.iris_decoded_intent ?? "(none)"}
Win themes: ${flatten(o.win_themes) || "(none)"}
Central claim: ${o.central_claim ?? "(none)"}
Discriminators: ${flatten(o.discriminators) || "(none)"}`;

    let user = "";
    if (tool === "decode") {
      user = `${base}

What is this question REALLY asking beyond the literal words? What are evaluators testing for? What does a high-scoring answer look like vs low-scoring? Specific to this mission. Max 200 words. Direct.`;
    } else if (tool === "win_angle") {
      user = `${base}
Competitors: ${[oecCompetitors, competitorNames.join(", ")].filter(Boolean).join(" | ") || "(unknown)"}

How should Athena specifically attack this question? What's the unique angle given who we are vs who else is bidding? Concrete strategic direction. Max 150 words.`;
    } else if (tool === "evidence") {
      user = `${base}
Proof points: ${flatten(o.proof_points) || "(none)"}
North star: ${o.north_star ?? "(none)"}

What specific evidence, data, or proof points should this writer use? Name them concretely. Reference numbers or sources from mission context where possible. Max 150 words. Numbered list.`;
    } else {
      user = `${base}
Mission risks: ${flatten(o.top_risks) || "(none)"}

What are the traps in this question? What do evaluators test for that most bidders get wrong? What language would score poorly? Direct and specific. Max 150 words.`;
    }

    if (mode === "go_deeper" && priorResponse) {
      user += `\n\nGo deeper on this prior response, adding texture and specificity (do not repeat it):\n${priorResponse}`;
    }

    const text = await callIrisText(SYSTEM, user);
    if (!text) throw new Error("IRIS returned an empty response. Try again shortly.");
    return { text };
  });
