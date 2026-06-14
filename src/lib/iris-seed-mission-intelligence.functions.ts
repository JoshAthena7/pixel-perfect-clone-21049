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

const InputSchema = z.object({
  missionId: z.string().uuid(),
  force: z.boolean().optional().default(false),
});

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
      // Guard: skip empty-mission auto-seed when events already exist,
      // unless the caller explicitly forced a refresh.
      if (!data.force) {
        const { count } = await supabase
          .from("intel_events")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId);
        if ((count ?? 0) > 0) {
          return { ok: true, skipped: "already_seeded", inserted: 0 };
        }
      }

      const { data: m } = await supabase
        .from("missions")
        .select("name, state, program_type, why_it_matters, biggest_concerns, north_star, win_themes_text")
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

      const briefSnippet = [m.why_it_matters, m.biggest_concerns].filter(Boolean).join("\n\n").slice(0, 1500);
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
          model: "gpt-4o-mini",
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

      // Cascade: fire a second IRIS pass for people / org / competitive intel.
      // Fire-and-forget within the handler — any failure logs and is swallowed
      // so the primary seed result is never blocked.
      let cascadeInserted = 0;
      try {
        const CASCADE_SYSTEM = `You are IRIS performing follow-up intelligence enrichment for this mission.

Mission: ${m.name ?? "(unnamed)"}
State: ${m.state ?? "n/a"}
Program Area: ${m.program_type ?? ""}
Brief: ${briefSnippet || "(none)"}

Generate 6 follow-up intelligence items distributed as:
- 2 items of event_type "stakeholder_update" (people / decision-makers / influencers relevant to this procurement)
- 2 items of event_type "competitive_update" (likely competitors, prior awardees, market posture)
- 2 items of event_type "research_finding" (organizational / agency background the team should know)

For each item return:
{ "title": "Short title (max 8 words)",
  "summary": "2-3 sentence intelligence summary",
  "event_type": "stakeholder_update|competitive_update|research_finding",
  "signal_category": one of [stakeholder, competitor, market_movement, federal_policy, state_policy, procurement, decision_intelligence, relationship_intelligence],
  "iris_recommendation": "1 sentence next step" }

Return ONLY a JSON array. No preamble.`;

        const cres = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: CASCADE_SYSTEM },
              { role: "user", content: "Generate the JSON array now." },
            ],
          }),
        });
        if (cres.ok) {
          const cjson = (await cres.json()) as { choices?: Array<{ message?: { content?: string } }> };
          const craw = (cjson.choices?.[0]?.message?.content ?? "").trim();
          const cclean = craw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
          let cparsed: Array<Record<string, unknown>> = [];
          try {
            const cj = JSON.parse(cclean);
            cparsed = Array.isArray(cj) ? cj : Array.isArray((cj as any)?.items) ? (cj as any).items : [];
          } catch {
            console.log("[iris-seed] cascade invalid JSON; skipping");
          }
          const ALLOWED_EVENT = new Set(["stakeholder_update", "competitive_update", "research_finding"]);
          const crows = cparsed
            .map((p) => {
              const title = String(p.title ?? "").trim().slice(0, 200);
              const summary = String(p.summary ?? "").trim();
              const event_type = String(p.event_type ?? "").trim();
              const signal_category = String(p.signal_category ?? "").trim();
              const iris_recommendation = String(p.iris_recommendation ?? "").trim() || null;
              if (!title || !summary) return null;
              if (!ALLOWED_EVENT.has(event_type)) return null;
              return {
                mission_id: missionId,
                event_type,
                output_type:
                  event_type === "stakeholder_update"
                    ? "stakeholder_profile"
                    : event_type === "competitive_update"
                      ? "intel_card_candidate"
                      : "intel_card_candidate",
                signal_category: ALLOWED_CATEGORIES.has(signal_category) ? signal_category : null,
                title,
                content: summary,
                extracted_summary: summary,
                iris_recommendation,
                confidence: "medium",
                routing_status: "auto_seeded",
                source_title: "IRIS Cascade",
                source_type: "iris",
                generated_by: "iris",
                state: m.state ?? null,
                tags: ["iris_cascade", "auto_seeded"],
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          if (crows.length > 0) {
            const { error: cInsErr } = await supabase.from("intel_events").insert(crows);
            if (cInsErr) {
              console.log("[iris-seed] cascade insert failed", cInsErr.message);
            } else {
              cascadeInserted = crows.length;
            }
          }
        } else {
          console.log("[iris-seed] cascade gateway", cres.status);
        }
      } catch (e) {
        console.log("[iris-seed] cascade threw", e instanceof Error ? e.message : String(e));
      }

      return { ok: true, inserted: rows.length, cascadeInserted };

    } catch (e) {
      console.warn("[iris-seed] unexpected", e instanceof Error ? e.message : String(e));
      return { ok: false, inserted: 0, error: "unexpected" };
    }
  });
