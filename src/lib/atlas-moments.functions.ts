/**
 * ATLAS Mission Moments — Inspiration and Trivia for the Team Pulse card.
 *
 * Reads from atlas_mission_moments for today; if missing, generates via
 * Lovable AI Gateway and persists via the admin client (RLS allows reads
 * for the mission team but only service_role writes).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withAICircuit } from "@/lib/ai-circuit-breaker";

type MomentType = "inspiration" | "trivia" | "teamwork_nudge";

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

const INSPIRATION_SYS = `You are IRIS, the intelligence co-pilot for Athena Strategy Group — a small, expert team that wins complex Medicaid procurements. You speak in the voice of a trusted colleague at 7am on a deadline week — direct, specific, human. Never motivational-poster. Never corporate wellness. Specific to the mission and what's actually at stake for the people the program serves. Return ONLY valid JSON, no markdown, no backticks.`;

const TRIVIA_SYS = `You are IRIS, the intelligence co-pilot for Athena Strategy Group. Generate one genuinely interesting trivia question that makes a proposal writer smarter about THIS specific program. Not a compliance fact — something a domain expert would find satisfying to know. Specific. No corporate trivia. Return ONLY valid JSON, no markdown, no backticks.`;

async function buildContext(supabase: any, missionId: string) {
  const [m, oec, team] = await Promise.all([
    supabase.from("missions").select("name, state, program_type, client_name").eq("id", missionId).maybeSingle(),
    supabase.from("oracle_engagement_config").select("north_star, win_themes, central_claim, top_risks").eq("mission_id", missionId).maybeSingle(),
    supabase.from("mission_team_members").select("member_id, atlas_team_members:member_id(first_name, last_name)").eq("mission_id", missionId),
  ]);
  const winThemes = Array.isArray(oec.data?.win_themes)
    ? oec.data!.win_themes.map((t: any) => typeof t === "string" ? t : t?.title ?? t?.theme ?? JSON.stringify(t)).filter(Boolean)
    : [];
  const teamNames = (team.data ?? [])
    .map((r: any) => `${r.atlas_team_members?.first_name ?? ""} ${r.atlas_team_members?.last_name ?? ""}`.trim())
    .filter(Boolean);
  return {
    mission: m.data ?? { name: "Unknown mission", state: null, program_type: null, client_name: null },
    northStar: oec.data?.north_star ?? "",
    centralClaim: oec.data?.central_claim ?? "",
    winThemes,
    teamNames,
  };
}

/** Read-or-generate a mission moment for today. Returns the persisted row. */
export const ensureMissionMoment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    missionId: z.string().uuid(),
    momentType: z.enum(["inspiration", "trivia"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { missionId, momentType } = data;

    // 1) Check today's cache
    const { data: existing } = await supabase
      .from("atlas_mission_moments")
      .select("id, moment_type, content, active_date, created_at")
      .eq("mission_id", missionId)
      .eq("moment_type", momentType)
      .eq("active_date", new Date().toISOString().slice(0, 10))
      .maybeSingle();
    if (existing) return existing;

    // 2) Generate via AI
    const ctx = await buildContext(supabase, missionId);

    let content: Record<string, unknown> | null = null;
    if (momentType === "inspiration") {
      const userMsg = `Mission: ${ctx.mission.name} (${ctx.mission.client_name ?? "—"})
State: ${ctx.mission.state ?? "—"} | Program: ${ctx.mission.program_type ?? "—"}
Win themes: ${ctx.winThemes.join(" | ") || "(none yet)"}
North star: ${ctx.northStar || "(none yet)"}
Team: ${ctx.teamNames.join(", ") || "(no team listed)"}

Generate one short inspiration moment. Return JSON:
{
  "quote": "max 180 chars — specific to this mission and what's at stake for the people served",
  "attribution": "who this is from — e.g. 'Josh Boynton · Athena Strategy Group' or 'IRIS · Mission Brief'",
  "context": "max 100 chars — why this matters NOW"
}`;
      const raw = await callIris(INSPIRATION_SYS, userMsg);
      content = parseJson(raw);
    } else {
      // Trivia: gather this user's assigned question titles for relevance
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("question_id, mission_questions:question_id(question_number, question_text)")
        .eq("mission_id", missionId)
        .eq("assigned_writer_id", userId)
        .limit(20);
      const qList = (asgs ?? [])
        .map((a: any) => `${a.mission_questions?.question_number ?? "?"} — ${(a.mission_questions?.question_text ?? "").slice(0, 100)}`)
        .filter(Boolean);
      const userMsg = `Mission: ${ctx.mission.name}
State: ${ctx.mission.state ?? "—"} | Program: ${ctx.mission.program_type ?? "—"}
Questions assigned to this user:
${qList.length ? qList.map(q => `- ${q}`).join("\n") : "(none yet)"}

Generate ONE trivia question that makes this writer smarter about the specific program. Return JSON:
{
  "question": "the trivia question",
  "options": ["A","B","C","D"],
  "correct_index": 0,
  "explanation": "max 250 chars — why this matters to THIS mission specifically",
  "relevant_questions": ["question numbers this connects to"]
}`;
      const raw = await callIris(TRIVIA_SYS, userMsg);
      content = parseJson(raw);
    }

    if (!content) {
      throw new Error("IRIS returned an unreadable moment. Try again shortly.");
    }

    // 3) Persist via admin (RLS denies authenticated INSERT). UPSERT-on-conflict
    // against the unique (mission, type, date) index so concurrent reads are safe.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("atlas_mission_moments")
      .upsert({
        mission_id: missionId,
        moment_type: momentType,
        content: content as any,
        active_date: new Date().toISOString().slice(0, 10),
        generated_by: "iris",
      }, { onConflict: "mission_id,moment_type,active_date" })
      .select("id, moment_type, content, active_date, created_at")
      .single();
    if (insErr) throw insErr;
    return inserted;
  });
