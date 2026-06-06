// Server-only helper: loads the Mission Setup Record and formats the
// strategic preamble that grounds every IRIS call on this mission.
// Safe to import from createServerFn handlers. Do NOT import from client code.

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSetupCompleteness, type SetupCompleteness } from "./iris-mission-context";

export type MissionContext = {
  missionId: string;
  mission: Record<string, any> | null;
  evaluation: Array<{ category: string; points: number | null; competitive_risk: string | null }>;
  populationServed: string | null;
  geographicScope: string | null;
  completeness: SetupCompleteness;
};

export async function loadMissionContext(
  supabase: SupabaseClient,
  missionId: string,
): Promise<MissionContext> {
  const [{ data: mission }, { data: evaluation }] = await Promise.all([
    supabase
      .from("missions")
      .select(
        "id,name,client,state,state_agency,submission_date,program_type,incumbent_name,contract_value,contract_term,mission_highlights,client_strengths,client_win_strategy,program_goals,key_requirements,win_themes,priority_topics,competitors,iris_setup_suggested_fields,iris_setup_autofill_status",
      )
      .eq("id", missionId)
      .maybeSingle(),
    supabase
      .from("mission_evaluation_criteria")
      .select("category,points,competitive_risk,display_order")
      .eq("mission_id", missionId)
      .order("display_order", { ascending: true }),
  ]);

  const suggested = ((mission?.iris_setup_suggested_fields ?? {}) as Record<string, any>);
  const populationServed =
    typeof suggested.population_served?.value === "string"
      ? (suggested.population_served.value as string)
      : null;
  const geographicScope =
    typeof suggested.geographic_scope?.value === "string"
      ? (suggested.geographic_scope.value as string)
      : null;

  const completeness = computeSetupCompleteness({
    mission: mission ?? null,
    evaluationCount: (evaluation ?? []).length,
  });

  return {
    missionId,
    mission: mission ?? null,
    evaluation: (evaluation ?? []) as MissionContext["evaluation"],
    populationServed,
    geographicScope,
    completeness,
  };
}

function fmtStr(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : "(not yet provided)";
}
function fmtArr(v: unknown): string {
  return Array.isArray(v) && v.length > 0
    ? (v as any[]).map((x) => String(x)).join("; ")
    : "(not yet provided)";
}

export function formatMissionContextPreamble(ctx: MissionContext): string {
  const m = ctx.mission ?? ({} as any);
  const evalLine =
    ctx.evaluation.length === 0
      ? "(not yet provided)"
      : ctx.evaluation
          .map((e) => `${e.category}${e.points ? ` (${e.points}pts)` : ""}`)
          .join("; ");

  const lines = [
    `You are IRIS, the intelligence engine for ${fmtStr(m.name)}.`,
    "",
    "MISSION CONTEXT (from Setup Record):",
    `- Client: ${fmtStr(m.client)} / ${fmtStr(m.state_agency)}`,
    `- Win Strategy: ${fmtStr(m.client_win_strategy)}`,
    `- Client Strengths: ${fmtStr(m.client_strengths)}`,
    `- Program Goals: ${fmtStr(m.program_goals)}`,
    `- Win Themes: ${fmtArr(m.win_themes)}`,
    `- Key Contract Requirements: ${fmtArr(m.key_requirements)}`,
    `- Incumbent: ${fmtStr(m.incumbent_name)}`,
    `- Evaluation Criteria: ${evalLine}`,
    `- Population Served: ${fmtStr(ctx.populationServed)}`,
    `- Geographic Scope: ${fmtStr(ctx.geographicScope)}`,
    `- Submission Date: ${fmtStr(m.submission_date)}`,
    `- Contract Value: ${fmtStr(m.contract_value)}${m.contract_term ? ` over ${m.contract_term}` : ""}`,
    "",
    `Setup Record completeness: ${ctx.completeness.pct}% (${ctx.completeness.filled} of ${ctx.completeness.total} fields).`,
    ctx.completeness.pct < 100
      ? `Fields not yet provided: ${ctx.completeness.missing.map((f) => f.label).join(", ")}. Treat those as unknown — do not invent values.`
      : `All Setup Record fields are confirmed. Anchor every recommendation to this context.`,
    "",
    "Use this context to ground every response. Do not contradict it.",
    "Do not speculate about things explicitly stated here.",
  ];
  return lines.join("\n");
}
