/**
 * /api/public/hooks/atlas-daily-moments
 *
 * Daily cron at 05:00 UTC. For every active mission, generates today's
 * Inspiration + Trivia moments (idempotent — UNIQUE(mission, type, date)
 * makes repeat runs safe).
 *
 * Auth: pg_cron passes the Supabase anon key in the `apikey` header.
 * `/api/public/*` bypasses Lovable's edge auth; we still validate `apikey`
 * matches the project's publishable key before doing any work.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

async function callIris(apiKey: string, system: string, user: string): Promise<string> {
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
  if (!res.ok) throw new Error(`AI gateway ${res.status}`);
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

const INSPIRATION_SYS = `You are IRIS, intelligence co-pilot for Athena Strategy Group. Share a piece of general inspiration — a quote, idea, or short reflection on craft, focus, teamwork, public service, or doing hard things well. Voice of a trusted colleague at 7am, direct and human, never motivational-poster. It should NOT reference the specific RFP, deadline, or compliance work. Return ONLY valid JSON.`;
const TRIVIA_SYS = `You are IRIS, intelligence co-pilot for Athena Strategy Group. Generate one genuinely interesting FUN FACT trivia question about the U.S. state the mission is in — its history, geography, culture, food, landmarks, notable people, or quirky records. NOT about the RFP, Medicaid, procurement, or compliance. Make it the kind of thing a curious colleague would enjoy at the start of the day. Return ONLY valid JSON.`;

export const Route = createFileRoute("/api/public/hooks/atlas-daily-moments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authorizeCron } = await import("@/lib/monitoring/cron-auth.server");
        const unauthorized = authorizeCron(request);
        if (unauthorized) return unauthorized;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) return Response.json({ error: "LOVABLE_API_KEY missing" }, { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: missions, error: mErr } = await supabaseAdmin
          .from("missions")
          .select("id, name, state, program_type, client_name");
        if (mErr) return Response.json({ error: mErr.message }, { status: 500 });

        const today = new Date().toISOString().slice(0, 10);
        const results: { missionId: string; inspiration: string; trivia: string }[] = [];

        for (const m of missions ?? []) {
          const r = { missionId: m.id, inspiration: "skip", trivia: "skip" };

          const { data: oec } = await supabaseAdmin
            .from("oracle_engagement_config")
            .select("north_star, win_themes, central_claim")
            .eq("mission_id", m.id).maybeSingle();
          const winThemes = flatten(oec?.win_themes);

          // INSPIRATION
          try {
            const { data: have } = await supabaseAdmin
              .from("atlas_mission_moments")
              .select("id").eq("mission_id", m.id).eq("moment_type", "inspiration").eq("active_date", today).maybeSingle();
            if (!have) {
              const userMsg = `Generate one piece of GENERAL inspiration — a quote or short reflection on craft, focus, teamwork, public service, or doing hard things well. Do NOT reference any specific RFP, client, deadline, or procurement. Keep it universal.

Return JSON: { "quote": "max 180 chars", "attribution": "who from — real author/source, or 'IRIS' if original", "context": "max 100 chars — why this idea is worth sitting with today" }`;
              const raw = await callIris(lovableKey, INSPIRATION_SYS, userMsg);
              const content = parseJson(raw);
              if (content) {
                await supabaseAdmin.from("atlas_mission_moments").upsert({
                  mission_id: m.id, moment_type: "inspiration", active_date: today,
                  content: content as any, generated_by: "iris-cron",
                }, { onConflict: "mission_id,moment_type,active_date" });
                r.inspiration = "ok";
              } else r.inspiration = "parse_failed";
            }
          } catch (e) {
            console.error("[atlas-daily-moments] inspiration", m.id, (e as Error).message);
            r.inspiration = "error";
          }

          // TRIVIA
          try {
            const { data: have } = await supabaseAdmin
              .from("atlas_mission_moments")
              .select("id").eq("mission_id", m.id).eq("moment_type", "trivia").eq("active_date", today).maybeSingle();
            if (!have) {
              const userMsg = `State: ${m.state ?? "—"}

Generate one FUN FACT trivia question about this U.S. state — history, geography, culture, food, landmarks, notable people, weird records, etc. NOT about the RFP, Medicaid, procurement, or compliance. Make it genuinely fun and a little surprising.

Return JSON: { "question": "the trivia question", "options": ["A","B","C","D"], "correct_index": 0, "explanation": "max 250 chars — the interesting story behind the answer", "relevant_questions": [] }`;
              const raw = await callIris(lovableKey, TRIVIA_SYS, userMsg);
              const content = parseJson(raw);
              if (content) {
                await supabaseAdmin.from("atlas_mission_moments").upsert({
                  mission_id: m.id, moment_type: "trivia", active_date: today,
                  content: content as any, generated_by: "iris-cron",
                }, { onConflict: "mission_id,moment_type,active_date" });
                r.trivia = "ok";
              } else r.trivia = "parse_failed";
            }
          } catch (e) {
            console.error("[atlas-daily-moments] trivia", m.id, (e as Error).message);
            r.trivia = "error";
          }

          results.push(r);
        }

        return Response.json({ ok: true, date: today, processed: results.length, results });
      },
    },
  },
});
