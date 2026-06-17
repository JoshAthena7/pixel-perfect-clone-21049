/**
 * /api/public/hooks/atlas-daily-focus-generator
 *
 * Daily cron at 06:00 UTC. For every active mission, generates today's
 * "Today's Focus" — 3 actionable focus items for the proposal team —
 * and upserts a row into `daily_intelligence_briefs` keyed by
 * (mission_id, brief_date).
 *
 * Auth: pg_cron passes the Supabase anon/publishable key in the `apikey`
 * header. `/api/public/*` bypasses Lovable's edge auth; we still validate
 * `apikey` matches the project's publishable key before doing any work.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withAICircuit } from "@/lib/ai-circuit-breaker";
import { buildMissionContext, serializeContextForPrompt } from "@/lib/iris/build-mission-context";

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

const FOCUS_SYS = `You are IRIS, intelligence co-pilot for Athena Strategy Group. Generate today's focus items for a proposal team under deadline pressure. Items must be specific, actionable tasks tied to the mission's win themes and strategic risks — not motivational statements. Return ONLY valid JSON.`;

type FocusItem = {
  priority: 1 | 2 | 3;
  title: string;
  detail: string;
  category: "writing" | "intel" | "review" | "coordination";
};

export const Route = createFileRoute("/api/public/hooks/atlas-daily-focus-generator")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
        if (!apiKey || !expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) return Response.json({ error: "LOVABLE_API_KEY missing" }, { status: 500 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: missions, error: mErr } = await supabaseAdmin
          .from("missions")
          .select("id, name, state, program_type, client_name, submission_deadline, created_by")
          .eq("status", "active");
        if (mErr) return Response.json({ error: mErr.message }, { status: 500 });

        const today = new Date().toISOString().slice(0, 10);
        const results: { missionId: string; status: string }[] = [];

        for (const m of missions ?? []) {
          if (!m.created_by) {
            results.push({ missionId: m.id, status: "skip_no_creator" });
            continue;
          }

          try {
            const { data: existing } = await supabaseAdmin
              .from("daily_intelligence_briefs")
              .select("id")
              .eq("mission_id", m.id)
              .eq("brief_date", today)
              .maybeSingle();
            if (existing) {
              results.push({ missionId: m.id, status: "exists" });
              continue;
            }

            const ctx = await buildMissionContext(supabaseAdmin as any, m.id);
            const contextBlock = serializeContextForPrompt(ctx, "full");
            console.log(`[atlas-daily-focus] ${m.id} context ${ctx._buildMs}ms ${contextBlock.length} chars`);

            let daysRemaining: number | null = null;
            if (m.submission_deadline) {
              const ms = new Date(m.submission_deadline).getTime() - Date.now();
              daysRemaining = Math.max(0, Math.ceil(ms / 86400000));
            }

            const { count: atRisk } = await supabaseAdmin
              .from("mission_questions")
              .select("id", { head: true, count: "exact" })
              .eq("mission_id", m.id)
              .eq("health_status", "at_risk");

            const userMsg = `=== FULL MISSION INTELLIGENCE ===
${contextBlock}

=== TODAY ===
Submission: ${m.submission_deadline ?? "TBD"} | Days remaining: ${daysRemaining ?? "—"}
Questions at risk: ${atRisk ?? 0}

Generate 3 specific focus items for the proposal team for today. Reference specific intelligence signals, named organizations or people, named win themes, or specific RFP sections from the context above — not generic advice. Actionable tasks for today.

Return JSON only:
{ "items": [
  { "priority": 1, "title": "max 60 chars", "detail": "max 120 chars", "category": "writing|intel|review|coordination" },
  { "priority": 2, "title": "...", "detail": "...", "category": "..." },
  { "priority": 3, "title": "...", "detail": "...", "category": "..." }
] }`;


            const raw = await callIris(lovableKey, FOCUS_SYS, userMsg);
            const parsed = parseJson<{ items?: FocusItem[] }>(raw);
            const items = Array.isArray(parsed?.items) ? parsed!.items : [];
            if (items.length === 0) {
              results.push({ missionId: m.id, status: "parse_failed" });
              continue;
            }

            const focusStrings = items.map((it) => `${it.title} — ${it.detail}`);
            const content = { focus_items: focusStrings, items };

            const { error: upErr } = await supabaseAdmin
              .from("daily_intelligence_briefs")
              .upsert(
                {
                  mission_id: m.id,
                  recipient_id: m.created_by,
                  brief_date: today,
                  brief_type: "admin_brief",
                  content: content as any,
                  key_intelligence_summary: "Daily focus generated by IRIS",
                  new_feed_items_count: 0,
                  at_risk_questions_count: atRisk ?? 0,
                  watch_questions_count: 0,
                  is_delivered: true,
                  is_read: false,
                } as any,
                { onConflict: "mission_id,brief_date" },
              );
            if (upErr) {
              console.error("[atlas-daily-focus] upsert", m.id, upErr.message);
              results.push({ missionId: m.id, status: "upsert_error" });
              continue;
            }
            results.push({ missionId: m.id, status: "ok" });
          } catch (e) {
            console.error("[atlas-daily-focus]", m.id, (e as Error).message);
            results.push({ missionId: m.id, status: "error" });
          }
        }

        return Response.json({ ok: true, date: today, processed: results.length, results });
      },
    },
  },
});
