/**
 * IRIS first-pass intelligence seed for a mission.
 * Called automatically by IntelFeed the FIRST time a mission's intel_events
 * table is empty. Generates 8-12 intelligence items via Lovable AI Gateway
 * and inserts them into intel_events with routing_status='auto_seeded'.
 *
 * Fully fire-and-forget from the UI's perspective — errors only log.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({ missionId: z.string().uuid() });

const ALLOWED_OUTPUT = new Set([
  "signal",
  "risk_candidate",
  "opportunity",
  "intel_card_candidate",
]);
const ALLOWED_CATEGORIES = new Set([
  "federal_policy", "state_policy", "waiver", "procurement", "competitor",
  "stakeholder", "provider_friction", "advocacy_pressure", "workforce",
  "rates", "behavioral_health", "child_welfare", "LTSS", "IDD", "duals",
  "crisis", "health_equity", "market_movement", "decision_intelligence",
  "relationship_intelligence",
]);

export const seedMissionIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { missionId } = data;

    try {
      // Guard: only seed when truly empty.
      const { count } = await supabase
        .from("intel_events")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId);
      if ((count ?? 0) > 0) {
        return { ok: true, skipped: "already_seeded", inserted: 0 };
      }

      const { data: m } = await supabase
        .from("missions")
        .select("name, state, program_type, description, north_star, win_themes_text")
        .eq("id", missionId)
        .maybeSingle();
      if (!m) {
        console.warn("[iris-seed] mission not found", missionId);
        return { ok: false, inserted: 0, error: "mission_not_found" };
      }

      const apiKey = process.env.LOVABLE_API_KEY;
      if (!apiKey) {
        console.warn("[iris-seed] LOVABLE_API_KEY missing");
        return { ok: false, inserted: 0, error: "no_api_key" };
      }

      const briefSnippet = (m.description ?? "").slice(0, 1500);
      const SYSTEM = `You are IRIS, the intelligence engine for ATLAS. You are performing a first-pass intelligence analysis on a new mission.

Mission: ${m.name ?? "(unnamed)"}
State: ${m.state ?? "n/a"}
Program Area: ${m.program_type ?? briefSnippet.slice(0, 500)}
Mission Brief: ${briefSnippet || "(none)"}
North Star: ${m.north_star ?? "(none)"}
Win Themes: ${m.win_themes_text ?? "(none)"}

Generate a comprehensive first-pass intelligence brief with 8-12 distinct intelligence items, distributed across these output types:
- signal (2-3 items): Early signals relevant to this procurement
- risk_candidate (2 items): Risks that could affect the bid
- opportunity (1-2 items): Strategic opportunities based on the program area
- intel_card_candidate (2-3 items): Key background intelligence the team should know

For each item, return:
{ "title": "Short title (max 8 words)",
  "summary": "2-3 sentence intelligence summary",
  "output_type": "signal|risk_candidate|opportunity|intel_card_candidate",
  "signal_category": one of [federal_policy, state_policy, waiver, procurement, competitor, stakeholder, provider_friction, advocacy_pressure, workforce, rates, behavioral_health, child_welfare, LTSS, IDD, duals, crisis, health_equity, market_movement, decision_intelligence, relationship_intelligence],
  "relevance_score": number 60-95,
  "confidence_score": number 55-90,
  "iris_recommendation": "1 sentence action or watch item" }

Return as a JSON array. No preamble. No explanation. Only the array.`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: "Generate the JSON array now." },
          ],
        }),
      });
      if (!res.ok) {
        console.warn("[iris-seed] gateway error", res.status);
        return { ok: false, inserted: 0, error: `gateway_${res.status}` };
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = (json.choices?.[0]?.message?.content ?? "").trim();
      const clean = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

      let parsed: Array<Record<string, unknown>>;
      try {
        const j = JSON.parse(clean);
        parsed = Array.isArray(j) ? j : Array.isArray((j as any)?.items) ? (j as any).items : [];
      } catch {
        console.warn("[iris-seed] invalid JSON from IRIS");
        return { ok: false, inserted: 0, error: "invalid_json" };
      }
      if (parsed.length === 0) {
        console.warn("[iris-seed] empty array from IRIS");
        return { ok: true, inserted: 0 };
      }

      const rows = parsed
        .map((p) => {
          const title = String(p.title ?? "").trim().slice(0, 200);
          const summary = String(p.summary ?? "").trim();
          const output_type = String(p.output_type ?? "").trim();
          const signal_category = String(p.signal_category ?? "").trim();
          const iris_recommendation = String(p.iris_recommendation ?? "").trim() || null;
          const relevance = Number(p.relevance_score);
          const confidence = Number(p.confidence_score);
          if (!title || !summary) return null;
          if (!ALLOWED_OUTPUT.has(output_type)) return null;
          return {
            mission_id: missionId,
            event_type: "iris_seed",
            output_type,
            signal_category: ALLOWED_CATEGORIES.has(signal_category) ? signal_category : null,
            title,
            content: summary,
            extracted_summary: summary,
            iris_recommendation,
            relevance_score: Number.isFinite(relevance) ? Math.max(60, Math.min(95, relevance)) : null,
            confidence_score: Number.isFinite(confidence) ? Math.max(55, Math.min(90, confidence)) : null,
            confidence: "medium",
            routing_status: "auto_seeded",
            source_title: "IRIS First-Pass Analysis",
            source_type: "iris",
            generated_by: "iris",
            state: m.state ?? null,
            tags: ["iris_seed", "auto_seeded"],
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (rows.length === 0) {
        console.warn("[iris-seed] all rows filtered out");
        return { ok: true, inserted: 0 };
      }

      const { error: insErr } = await supabase.from("intel_events").insert(rows);
      if (insErr) {
        console.warn("[iris-seed] insert failed", insErr.message);
        return { ok: false, inserted: 0, error: insErr.message };
      }
      return { ok: true, inserted: rows.length };
    } catch (e) {
      console.warn("[iris-seed] unexpected", e instanceof Error ? e.message : String(e));
      return { ok: false, inserted: 0, error: "unexpected" };
    }
  });
