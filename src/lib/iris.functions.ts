import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* ──────────────── iris-mission-pulse ────────────────
   Reads signals for a mission, groups by severity, returns top 5 attention
   items (critical + warning + info). */
export const irisMissionPulse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signals, error } = await supabase
      .from("signals")
      .select("id,signal_type,signal_title,signal_summary,severity,status,related_question_id,created_at")
      .eq("mission_id", data.missionId)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const all = signals ?? [];
    const groups = {
      critical: all.filter((s) => s.severity === "critical"),
      warning: all.filter((s) => s.severity === "warning"),
      info: all.filter((s) => s.severity === "info"),
    };
    const top = [...groups.critical, ...groups.warning, ...groups.info].slice(0, 5);
    return {
      counts: {
        critical: groups.critical.length,
        warning: groups.warning.length,
        info: groups.info.length,
        total: all.length,
      },
      top,
    };
  });

/* ──────────────── iris-leadership-attention ────────────────
   Aggregates across missions for the current user. Returns per-mission
   attention rollup + global counts. */
export const irisLeadershipAttention = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: missions } = await supabase.from("missions").select("id,name,client");
    const ids = (missions ?? []).map((m) => m.id);

    if (ids.length === 0) {
      return { missions: [], totals: { escalations: 0, criticalSignals: 0, lowScores: 0, conflicts: 0, atRiskAssumptions: 0, highRisks: 0 } };
    }

    const [escRes, sigRes, qRes, confRes, asmRes, riskRes] = await Promise.all([
      supabase.from("escalations").select("id,mission_id,severity,status").eq("status", "Open"),
      supabase.from("signals").select("id,mission_id,severity").eq("severity", "critical").eq("status", "open"),
      supabase.from("question_records").select("id,mission_id,current_score").lt("current_score", 3.0),
      supabase.from("alignment_conflicts").select("id,mission_id").is("resolved_at", null),
      supabase.from("mission_assumptions").select("id,mission_id,status").eq("status", "at_risk"),
      supabase.from("mission_risks").select("id,mission_id,severity,status").eq("severity", "High").neq("status", "Closed"),
    ]);

    const count = <T extends { mission_id: string }>(rows: T[] | null, mid: string) =>
      (rows ?? []).filter((r) => r.mission_id === mid).length;

    const perMission = (missions ?? []).map((m) => {
      const esc = count(escRes.data as { mission_id: string }[] | null, m.id);
      const crit = count(sigRes.data as { mission_id: string }[] | null, m.id);
      const low = count(qRes.data as { mission_id: string }[] | null, m.id);
      const conf = count(confRes.data as { mission_id: string }[] | null, m.id);
      const atRisk = count(asmRes.data as { mission_id: string }[] | null, m.id);
      const highRisk = count(riskRes.data as { mission_id: string }[] | null, m.id);
      const score = esc * 25 + crit * 10 + low * 5 + conf * 8 + atRisk * 6 + highRisk * 7;
      return {
        mission_id: m.id,
        name: m.name,
        client: m.client,
        attention_score: score,
        breakdown: { escalations: esc, criticalSignals: crit, lowScores: low, conflicts: conf, atRiskAssumptions: atRisk, highRisks: highRisk },
      };
    });

    perMission.sort((a, b) => b.attention_score - a.attention_score);

    return {
      missions: perMission,
      totals: {
        escalations: escRes.data?.length ?? 0,
        criticalSignals: sigRes.data?.length ?? 0,
        lowScores: qRes.data?.length ?? 0,
        conflicts: confRes.data?.length ?? 0,
        atRiskAssumptions: asmRes.data?.length ?? 0,
        highRisks: riskRes.data?.length ?? 0,
      },
    };
  });

/* ──────────────── iris-decision-memory ────────────────
   Returns mission_decisions with the signal history surrounding each. */
export const irisDecisionMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: decisions } = await supabase
      .from("mission_decisions")
      .select("id,title,status,owner,rationale,decided_at,question_id,created_at")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false });
    const decs = decisions ?? [];
    if (decs.length === 0) return { decisions: [] };

    const ids = decs.map((d) => d.id);
    const { data: sigs } = await supabase
      .from("signals")
      .select("id,signal_type,signal_title,severity,created_at,related_decision_id,related_question_id")
      .eq("mission_id", data.missionId)
      .or(`related_decision_id.in.(${ids.join(",")}),signal_type.eq.decision_logged`);

    return {
      decisions: decs.map((d) => ({
        ...d,
        signals: (sigs ?? []).filter(
          (s) => s.related_decision_id === d.id || (s.related_question_id && s.related_question_id === d.question_id),
        ),
      })),
    };
  });

/* ──────────────── iris-assumption-registry ────────────────
   Returns mission_assumptions with a simple confidence trend derived from
   created vs last_validated dates and current status. */
export const irisAssumptionRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ missionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: asm } = await supabase
      .from("mission_assumptions")
      .select("*")
      .eq("mission_id", data.missionId)
      .order("created_at", { ascending: false });
    const rows = asm ?? [];

    const withTrend = rows.map((a) => {
      const trend =
        a.status === "validated" ? "up" :
        a.status === "invalidated" || a.status === "at_risk" ? "down" :
        a.last_validated_date ? "stable" : "unknown";
      return { ...a, trend };
    });

    return {
      assumptions: withTrend,
      summary: {
        total: rows.length,
        at_risk: rows.filter((a) => a.status === "at_risk").length,
        invalidated: rows.filter((a) => a.status === "invalidated").length,
        validated: rows.filter((a) => a.status === "validated").length,
      },
    };
  });

/* Question-scoped recent signals — used by Question Workspace panel. */
export const irisQuestionSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ questionId: z.string().uuid(), limit: z.number().min(1).max(20).default(3) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: sigs, error } = await supabase
      .from("signals")
      .select("id,signal_type,signal_title,signal_summary,severity,created_at")
      .eq("related_question_id", data.questionId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { signals: sigs ?? [] };
  });
