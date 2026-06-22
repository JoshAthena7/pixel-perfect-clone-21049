/**
 * Shared morning-brief generator used by both the admin server fn
 * (`generateMorningBriefs`) and the pg_cron hook
 * (`/api/public/hooks/iris-morning-briefs`).
 *
 * For each active mission it asks Gemini for a 3-bullet "what changed
 * overnight" brief and writes a single admin-targeted row into
 * `atlas_notifications` with type `morning_brief`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

type MissionRow = {
  id: string;
  name: string | null;
  client_name: string | null;
  state: string | null;
  submission_deadline: string | null;
};

export type MorningBriefResult = {
  mission_id: string;
  status: "ok" | "skip_no_active" | "ai_failed" | "insert_failed" | "error";
  notification_id?: string;
  error?: string;
};

const SYS = `You are IRIS, intelligence co-pilot. Generate a terse 3-bullet morning brief for a mission lead summarizing what they need to know today. Return ONLY valid JSON: {"headline": string (max 80 chars), "bullets": [string, string, string] (max 120 chars each), "one_thing_to_do": string (max 120 chars)}.`;

async function callIris(apiKey: string, user: string): Promise<string | null> {
  try {
    const res = await withAICircuit(async () => {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYS },
            { role: "user", content: user },
          ],
        }),
      });
      if (r.status >= 500) throw new Error(`AI gateway ${r.status}`);
      return r;
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return (j.choices?.[0]?.message?.content ?? "").trim();
  } catch (e) {
    console.error("[iris-morning-briefs] ai", (e as Error).message);
    return null;
  }
}

function parseJson<T = unknown>(s: string): T | null {
  const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }
  const a = cleaned.indexOf("{");
  const b = cleaned.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(cleaned.slice(a, b + 1)) as T;
  } catch {
    return null;
  }
}

type BriefShape = { headline: string; bullets: string[]; one_thing_to_do: string };

export async function runMorningBriefs(
  supabase: SupabaseClient,
  apiKey: string,
): Promise<{
  ok: boolean;
  generated_at: string;
  processed: number;
  succeeded: number;
  results: MorningBriefResult[];
}> {
  const generatedAt = new Date().toISOString();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: missions } = await supabase
    .from("missions")
    .select("id, name, client_name, state, submission_deadline")
    .eq("status", "active");

  const results: MorningBriefResult[] = [];

  for (const m of (missions ?? []) as MissionRow[]) {
    try {
      // Lightweight "what changed" snapshot for the prompt.
      const [{ data: newSignals }, { data: atRisk }, { count: newWhispers }] = await Promise.all([
        supabase
          .from("oracle_signals")
          .select("title, signal_type, created_at")
          .eq("mission_id", m.id)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("mission_questions")
          .select("question_number, health_status")
          .eq("mission_id", m.id)
          .eq("health_status", "at_risk")
          .limit(8),
        supabase
          .from("mission_assist_events")
          .select("id", { head: true, count: "exact" })
          .eq("mission_id", m.id)
          .gte("created_at", since),
      ]);

      let daysRemaining: number | null = null;
      if (m.submission_deadline) {
        const ms = new Date(m.submission_deadline).getTime() - Date.now();
        daysRemaining = Math.max(0, Math.ceil(ms / 86400000));
      }

      const user = `Mission: ${m.name ?? "(untitled)"} · Client: ${m.client_name ?? "?"} · ${m.state ?? "?"}
Days until submission: ${daysRemaining ?? "—"}
New ORACLE signals (last 24h): ${(newSignals ?? []).map((s: any) => `[${s.signal_type}] ${s.title}`).join(" | ") || "none"}
At-risk questions: ${(atRisk ?? []).map((q: any) => q.question_number).join(", ") || "none"}
New whispers/assist events (last 24h): ${newWhispers ?? 0}

Generate the morning brief now.`;

      const raw = await callIris(apiKey, user);
      const parsed = raw ? parseJson<BriefShape>(raw) : null;
      if (!parsed || !Array.isArray(parsed.bullets)) {
        results.push({ mission_id: m.id, status: "ai_failed" });
        continue;
      }

      const message = `${parsed.headline} — ${parsed.bullets.join(" • ")}`;
      const { data: ins, error: insErr } = await supabase
        .from("atlas_notifications")
        .insert({
          recipient_role: "admin",
          type: "morning_brief",
          message,
          metadata: {
            mission_id: m.id,
            mission_name: m.name,
            generated_at: generatedAt,
            headline: parsed.headline,
            bullets: parsed.bullets,
            one_thing_to_do: parsed.one_thing_to_do,
            days_remaining: daysRemaining,
          } as any,
        })
        .select("id")
        .single();
      if (insErr) {
        results.push({ mission_id: m.id, status: "insert_failed", error: insErr.message });
        continue;
      }
      results.push({ mission_id: m.id, status: "ok", notification_id: ins?.id });
    } catch (e) {
      results.push({ mission_id: m.id, status: "error", error: (e as Error).message });
    }
  }

  const succeeded = results.filter((r) => r.status === "ok").length;
  return {
    ok: true,
    generated_at: generatedAt,
    processed: results.length,
    succeeded,
    results,
  };
}
