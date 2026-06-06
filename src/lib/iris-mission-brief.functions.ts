import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callIris } from "./iris-prompts";
import { loadMissionContext, formatMissionContextPreamble } from "./iris-mission-context.server";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

export const generateMissionBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      missionId: z.string().uuid(),
      force: z.boolean().optional().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (!data.force) {
      const { data: cached } = await supabase
        .from("iris_brief_cache")
        .select("brief_text, generated_at")
        .eq("scope", "mission")
        .eq("ref_id", data.missionId)
        .eq("user_id", userId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cached?.generated_at) {
        const age = Date.now() - new Date(cached.generated_at).getTime();
        if (age < CACHE_TTL_MS) {
          return { brief: cached.brief_text, generated_at: cached.generated_at, cached: true };
        }
      }
    }

    const { data: mission } = await supabase
      .from("missions")
      .select("id,name,client,state,submission_date,health,win_themes,rfp_parsed")
      .eq("id", data.missionId)
      .maybeSingle();
    if (!mission) {
      return {
        brief: "Mission brief is unavailable. You may not have access to this mission, or it no longer exists.",
        generated_at: new Date().toISOString(),
        cached: false,
        error: "mission_not_found" as const,
      };
    }

    const [{ data: questions }, { data: conflicts }, { data: collab }, { data: gates }, { data: scores }, { data: themes }] = await Promise.all([
      supabase
        .from("question_records")
        .select("id,question_number,title,health,status,pens_down_date,current_score,assigned_writer_id,assigned_sme_id")
        .eq("mission_id", data.missionId),
      supabase
        .from("alignment_conflicts")
        .select("description,severity,detected_at")
        .eq("mission_id", data.missionId)
        .is("resolved_at", null),
      supabase
        .from("question_collaboration")
        .select("question_id,entry_type,body,author_name,created_at")
        .eq("mission_id", data.missionId)
        .in("entry_type", ["sme_request", "decision_needed", "air_cover"])
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("mission_review_gates")
        .select("gate_name,target_date")
        .eq("mission_id", data.missionId)
        .gte("target_date", new Date().toISOString().slice(0, 10))
        .order("target_date", { ascending: true })
        .limit(3),
      supabase
        .from("question_scores")
        .select("question_id,score,score_type,scored_at")
        .order("scored_at", { ascending: false })
        .limit(50),
      supabase
        .from("win_themes")
        .select("title,key_message")
        .eq("mission_id", data.missionId)
        .eq("status", "active"),
    ]);

    const qs = questions ?? [];
    const g = qs.filter((q) => q.health === "green").length;
    const y = qs.filter((q) => q.health === "yellow").length;
    const r = qs.filter((q) => q.health === "red").length;
    const days = mission.submission_date
      ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
      : null;

    const atRisk = qs.filter((q) => {
      if (!q.pens_down_date) return false;
      const d = Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000);
      return d <= 14 && q.health !== "green";
    });
    const lowScores = qs.filter((q) => (q.current_score ?? 5) < 4.5);

    const userMsg = `MISSION: ${mission.name} · ${mission.client}${mission.state ? ` · ${mission.state}` : ""}
Submission: ${mission.submission_date ?? "TBD"}${days !== null ? ` (${days} days)` : ""}
Overall health: ${mission.health}
Win themes: ${(mission.win_themes ?? []).join("; ") || "(none)"}

Questions: ${qs.length} total — ${g} green, ${y} yellow, ${r} red
At risk (pens-down ≤14d, health ≠ green): ${atRisk.length}
${atRisk.slice(0, 6).map((q) => `  - Q${q.question_number} "${q.title}" — ${q.health}, pens-down ${q.pens_down_date}`).join("\n")}

Below Athena Standard (score < 4.5): ${lowScores.length}
${lowScores.slice(0, 5).map((q) => `  - Q${q.question_number} score=${q.current_score}`).join("\n")}

Unresolved team needs (${(collab ?? []).length}):
${(collab ?? []).slice(0, 8).map((c) => `  - [${c.entry_type}] ${c.author_name}: ${(c.body ?? "").slice(0, 140)}`).join("\n") || "  (none)"}

Unresolved alignment conflicts (${(conflicts ?? []).length}):
${(conflicts ?? []).slice(0, 5).map((c) => `  - [${c.severity}] ${c.description.slice(0, 160)}`).join("\n") || "  (none)"}

Next review gates:
${(gates ?? []).map((g) => `  - ${g.gate_name} on ${g.target_date}`).join("\n") || "  (none scheduled)"}

Active win themes:
${(themes ?? []).map((t) => `  - ${t.title}${t.key_message ? `: ${t.key_message.slice(0, 100)}` : ""}`).join("\n") || "  (none)"}`;

    const missionCtx = await loadMissionContext(supabase, data.missionId);
    const preamble = formatMissionContextPreamble(missionCtx);

    const sys = `${preamble}

Write a 2-to-4 sentence mission brief for ${mission.name}.
Cover: overall health, the most urgent issue, and any team needs requiring leadership attention.
Lead with the win strategy and program goals from the Setup Record above when relevant.
Use question numbers (Q4.3 etc.) and writer names when available. Be specific and direct.
Plain prose. No headers, no bullets.`;

    let brief = await callIris(sys, userMsg);
    if (!brief) {
      // Fallback to deterministic summary
      const parts: string[] = [];
      if (days !== null) {
        if (days < 0) parts.push(`Submission is ${Math.abs(days)} days overdue.`);
        else if (days <= 7) parts.push(`Submission in ${days} days — critical window.`);
        else parts.push(`${days} days to submission.`);
      }
      if (qs.length) parts.push(`${qs.length} questions in flight: ${g} green, ${y} yellow, ${r} red.`);
      if (r > 0) parts.push(`${r} red question${r > 1 ? "s need" : " needs"} immediate attention.`);
      brief = parts.join(" ") || "Mission underway. IRIS is monitoring.";
    }

    await supabase.from("iris_brief_cache").insert({
      scope: "mission",
      ref_id: data.missionId,
      user_id: userId,
      brief_text: brief,
      expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    });

    return { brief, generated_at: new Date().toISOString(), cached: false };
  });
