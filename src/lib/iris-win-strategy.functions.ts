// IRIS Win Strategy draft generator. One-shot call; persists a
// mission_win_strategy record with iris_drafted_at on success.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

const Input = z.object({ mission_id: z.string().uuid() });

export type Competitor = { name: string; strengths: string; weaknesses: string; notes: string };
export type WinStrategyDraft = {
  mission_significance: string;
  central_claim: string;
  win_themes: string[];
  known_competitors: Competitor[];
  evaluator_priorities: string;
  evaluator_hot_buttons: string;
  known_risks: string;
  proof_points: string[];
  discriminators: string;
  north_star_message: string;
};

const SYSTEM = `You are a Medicaid procurement strategy expert. Based on the provided RFP intelligence, draft a complete win strategy. Return ONLY valid JSON with no markdown, no explanation, no backticks, in EXACTLY this format:
{
  "mission_significance": "2-3 sentences on why winning this contract matters",
  "central_claim": "One sentence — the single most important thing this proposer is claiming",
  "win_themes": ["theme 1", "theme 2", "theme 3", "theme 4", "theme 5"],
  "known_competitors": [{"name": "likely competitor name", "strengths": "brief", "weaknesses": "brief", "notes": "brief"}],
  "evaluator_priorities": "2-3 sentences on what evaluators actually care about",
  "evaluator_hot_buttons": "2-3 sentences on specific topics that influence this evaluator profile",
  "known_risks": "2-3 sentences on risks that could hurt this proposal",
  "proof_points": ["specific evidence point 1", "specific evidence point 2", "specific evidence point 3"],
  "discriminators": "2-3 sentences on what makes this proposer different from every other bidder",
  "north_star_message": "One phrase — what evaluators should remember after reading the proposal"
}`;

function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : [];
}
function asCompetitors(v: unknown): Competitor[] {
  if (!Array.isArray(v)) return [];
  return v.map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    return {
      name: asStr(o.name),
      strengths: asStr(o.strengths),
      weaknesses: asStr(o.weaknesses),
      notes: asStr(o.notes),
    };
  });
}
function normalize(j: unknown): WinStrategyDraft {
  const o = (j ?? {}) as Record<string, unknown>;
  return {
    mission_significance: asStr(o.mission_significance),
    central_claim: asStr(o.central_claim),
    win_themes: asStrArr(o.win_themes),
    known_competitors: asCompetitors(o.known_competitors),
    evaluator_priorities: asStr(o.evaluator_priorities),
    evaluator_hot_buttons: asStr(o.evaluator_hot_buttons),
    known_risks: asStr(o.known_risks),
    proof_points: asStrArr(o.proof_points),
    discriminators: asStr(o.discriminators),
    north_star_message: asStr(o.north_star_message),
  };
}
function tryParse(s: string): WinStrategyDraft | null {
  try {
    return normalize(JSON.parse(s));
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return normalize(JSON.parse(m[0]));
    } catch {
      return null;
    }
  }
}

export type DraftResult =
  | { ok: true; created: boolean }
  | { ok: false; created: true; reason: string };

export const draftWinStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<DraftResult> => {
    const { supabase } = context;

    // If a record already exists, do nothing.
    const { data: existing } = await supabase
      .from("mission_win_strategy")
      .select("id")
      .eq("mission_id", data.mission_id)
      .maybeSingle();
    if (existing) return { ok: true, created: false };

    // Gather RFP context
    const [mission, sections, themes] = await Promise.all([
      supabase
        .from("missions")
        .select("name, client_name")
        .eq("id", data.mission_id)
        .single(),
      supabase
        .from("mission_sections")
        .select("section_number, name")
        .eq("mission_id", data.mission_id)
        .order("order_index"),
      supabase
        .from("win_themes")
        .select("theme")
        .eq("mission_id", data.mission_id),
    ]);

    const ctx = [
      `Mission: ${mission.data?.name ?? "—"}`,
      `Client: ${mission.data?.client_name ?? "—"}`,
      `Sections: ${(sections.data ?? [])
        .map((s) => `${s.section_number ?? ""} ${s.name ?? ""}`.trim())
        .filter(Boolean)
        .join("; ") || "—"}`,
      `Existing win themes: ${
        (themes.data ?? [])
          .map((t) => (t as { theme?: string }).theme)
          .filter(Boolean)
          .join("; ") || "—"
      }`,
    ].join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;

    const blankInsert = async (reason: string): Promise<DraftResult> => {
      await supabase
        .from("mission_win_strategy")
        .insert({ mission_id: data.mission_id, confirmed_fields: [] });
      return { ok: false, created: true, reason };
    };

    if (!apiKey) return blankInsert("IRIS not configured.");

    let parsed: WinStrategyDraft | null = null;
    try {
      const res = await withAICircuit(async () => {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: `RFP context:\n${ctx}` },
            ],
          }),
        });
        if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
        return r;
      });

      if (res.status === 402) return blankInsert("Workspace is out of AI credits.");
      if (res.status === 429) return blankInsert("IRIS is rate limited.");
      if (!res.ok) return blankInsert(`IRIS returned ${res.status}.`);

      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      parsed = tryParse(json.choices?.[0]?.message?.content?.trim() ?? "");
    } catch (e) {
      return blankInsert((e as Error).message ?? "AI call failed.");
    }
    if (!parsed) return blankInsert("IRIS returned an unparseable draft.");

    const { error } = await supabase.from("mission_win_strategy").insert({
      mission_id: data.mission_id,
      mission_significance: parsed.mission_significance,
      central_claim: parsed.central_claim,
      win_themes: parsed.win_themes,
      known_competitors: parsed.known_competitors,
      evaluator_priorities: parsed.evaluator_priorities,
      evaluator_hot_buttons: parsed.evaluator_hot_buttons,
      known_risks: parsed.known_risks,
      proof_points: parsed.proof_points,
      discriminators: parsed.discriminators,
      north_star_message: parsed.north_star_message,
      iris_drafted_at: new Date().toISOString(),
      confirmed_fields: [],
    });
    if (error) return { ok: false, created: false, reason: error.message };
    return { ok: true, created: true };
  });
