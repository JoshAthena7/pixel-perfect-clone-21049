import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Phase 2: Mission Radar generator.
 *
 * Reads the current state of a mission across several source tables, derives
 * radar signals with impact/urgency/confidence/proximity, and writes them into
 * `public.mission_radar_signals`. The `getMissionRadar` reader then surfaces
 * these rows on the Mission Radar UI.
 *
 * Generator-owned rows are tagged with `source_table = 'gen:<source>'` so a
 * regenerate can safely wipe just its own output without touching any signals
 * that may have been written by other systems.
 */

type Category =
  | "risk"
  | "opportunity"
  | "intelligence"
  | "readiness"
  | "stakeholder"
  | "competitive"
  | "schedule";

type SignalDraft = {
  category: Category;
  headline: string;
  body: string | null;
  impact: number;   // 0..1
  urgency: number;  // 0..1
  confidence: number;
  proximity: number;
  source_table: string;
  source_id: string | null;
  deep_link: string | null;
  iris_rationale: string | null;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const daysBetween = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

function score(d: SignalDraft): number {
  return clamp01(d.impact * 0.35 + d.urgency * 0.35 + d.confidence * 0.15 + d.proximity * 0.15);
}
function ring(s: number): "inner" | "mid" | "outer" {
  if (s >= 0.7) return "inner";
  if (s >= 0.45) return "mid";
  return "outer";
}
function severity(s: number): "critical" | "high" | "medium" | "ambient" {
  if (s >= 0.75) return "critical";
  if (s >= 0.55) return "high";
  if (s >= 0.35) return "medium";
  return "ambient";
}

const Input = z.object({ missionId: z.string().uuid() });

export const generateMissionRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { missionId } = data;

    // Authorization: any team member or admin can regenerate.
    const [{ data: member }, { data: isAdmin }] = await Promise.all([
      supabase
        .from("mission_team_members")
        .select("mission_id")
        .eq("mission_id", missionId)
        .eq("member_id", userId)
        .maybeSingle(),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!member && !isAdmin) {
      throw new Error("Forbidden — you do not have access to this mission.");
    }

    const now = new Date();
    const drafts: SignalDraft[] = [];

    // ---------------- Source pulls (best-effort, in parallel) ----------------
    const [risksR, qsR, milestonesR, oracleR, competitorsR, assumptionsR] =
      await Promise.all([
        supabase
          .from("mission_risks")
          .select("id, title, description, severity, status")
          .eq("mission_id", missionId)
          .neq("status", "closed"),
        supabase
          .from("mission_questions")
          .select("id, question_number, question_text, health_status, status, due_date, point_value")
          .eq("mission_id", missionId)
          .eq("is_withdrawn", false),
        supabase
          .from("mission_milestones")
          .select("id, title, milestone_type, milestone_date, is_hard_deadline, is_pens_down, is_active, status")
          .eq("mission_id", missionId)
          .eq("is_active", true)
          .gte("milestone_date", now.toISOString().slice(0, 10))
          .order("milestone_date", { ascending: true })
          .limit(20),
        supabase
          .from("oracle_signals")
          .select("id, title, summary, why_it_matters, urgency_score, impact_score, confidence_score, status, created_at")
          .eq("mission_id", missionId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("competitor_profiles")
          .select("id, organization_name, competitor_type, known_strengths, likely_narrative")
          .eq("mission_id", missionId),
        supabase
          .from("mission_assumptions")
          .select("id, assumption, confidence_score, status, risk_if_wrong")
          .eq("mission_id", missionId)
          .limit(20),
      ]);

    // ---------------- Risks → category: risk ----------------
    for (const r of risksR.data ?? []) {
      const sev = (r.severity ?? "medium").toLowerCase();
      const impact = sev === "critical" || sev === "high" ? 0.9 : sev === "low" ? 0.35 : 0.6;
      const urgency = r.status === "active" || r.status === "open" ? 0.7 : 0.5;
      drafts.push({
        category: "risk",
        headline: r.title,
        body: r.description ?? null,
        impact,
        urgency,
        confidence: 0.7,
        proximity: 0.6,
        source_table: "gen:mission_risks",
        source_id: r.id,
        deep_link: `/missions/${missionId}/war-room`,
        iris_rationale: `Severity ${sev}${r.status ? ` · ${r.status}` : ""}`,
      });
    }

    // ---------------- Questions → risk if at-risk/sos, opportunity if high points ----------------
    for (const q of qsR.data ?? []) {
      const health = (q.health_status ?? "").toLowerCase();
      const due = q.due_date ? new Date(q.due_date) : null;
      const daysToDue = due ? daysBetween(due, now) : null;
      const proximity =
        daysToDue == null ? 0.3 : daysToDue < 0 ? 1 : daysToDue <= 3 ? 0.9 : daysToDue <= 7 ? 0.7 : daysToDue <= 21 ? 0.45 : 0.25;

      const isSos = health === "sos" || health === "red" || q.status === "sos";
      const isAtRisk = health === "at_risk" || health === "yellow";
      if (isSos || isAtRisk) {
        drafts.push({
          category: "risk",
          headline: `Q${q.question_number ?? "?"} ${isSos ? "SOS" : "at risk"}`,
          body: q.question_text?.slice(0, 240) ?? null,
          impact: Math.min(1, 0.5 + (q.point_value ?? 0) / 200),
          urgency: isSos ? 0.95 : 0.7,
          confidence: 0.85,
          proximity,
          source_table: "gen:mission_questions",
          source_id: q.id,
          deep_link: `/missions/${missionId}/war-room`,
          iris_rationale: `Health ${health || "unknown"}${daysToDue != null ? ` · ${daysToDue}d to due` : ""}`,
        });
      } else if ((q.point_value ?? 0) >= 50 && health === "green") {
        drafts.push({
          category: "opportunity",
          headline: `Q${q.question_number ?? "?"} high-value question on track`,
          body: q.question_text?.slice(0, 240) ?? null,
          impact: Math.min(1, 0.4 + (q.point_value ?? 0) / 200),
          urgency: 0.35,
          confidence: 0.7,
          proximity: proximity * 0.7,
          source_table: "gen:mission_questions",
          source_id: q.id,
          deep_link: `/missions/${missionId}/war-room`,
          iris_rationale: `${q.point_value} pts · healthy`,
        });
      }
    }

    // ---------------- Milestones → schedule ----------------
    for (const m of milestonesR.data ?? []) {
      const due = new Date(m.milestone_date);
      const days = daysBetween(due, now);
      const isHard = m.is_hard_deadline || m.is_pens_down;
      const proximity = days <= 0 ? 1 : days <= 3 ? 0.95 : days <= 7 ? 0.8 : days <= 21 ? 0.55 : 0.3;
      drafts.push({
        category: "schedule",
        headline: m.title ?? m.milestone_type,
        body: null,
        impact: isHard ? 0.95 : 0.6,
        urgency: proximity,
        confidence: 0.95,
        proximity,
        source_table: "gen:mission_milestones",
        source_id: m.id,
        deep_link: `/missions/${missionId}/journey`,
        iris_rationale: `${days}d away${isHard ? " · hard deadline" : ""}`,
      });
    }

    // ---------------- Oracle signals → intelligence ----------------
    for (const o of oracleR.data ?? []) {
      const impact = clamp01((o.impact_score ?? 50) / 100);
      const urgency = clamp01((o.urgency_score ?? 50) / 100);
      const confidence = clamp01((o.confidence_score ?? 70) / 100);
      const ageDays = daysBetween(now, new Date(o.created_at));
      const proximity = ageDays <= 1 ? 0.85 : ageDays <= 7 ? 0.65 : ageDays <= 21 ? 0.45 : 0.25;
      drafts.push({
        category: "intelligence",
        headline: o.title,
        body: o.why_it_matters ?? o.summary ?? null,
        impact,
        urgency,
        confidence,
        proximity,
        source_table: "gen:oracle_signals",
        source_id: o.id,
        deep_link: `/missions/${missionId}/intel`,
        iris_rationale: `Oracle signal · ${ageDays}d old`,
      });
    }

    // ---------------- Competitors → competitive ----------------
    for (const c of competitorsR.data ?? []) {
      const t = (c.competitor_type ?? "").toLowerCase();
      const impact = t === "incumbent" ? 0.9 : t === "likely_bidder" ? 0.7 : 0.45;
      drafts.push({
        category: "competitive",
        headline: `${c.organization_name} (${c.competitor_type})`,
        body: c.likely_narrative ?? c.known_strengths ?? null,
        impact,
        urgency: t === "incumbent" ? 0.6 : 0.4,
        confidence: 0.7,
        proximity: 0.5,
        source_table: "gen:competitor_profiles",
        source_id: c.id,
        deep_link: `/missions/${missionId}/intel`,
        iris_rationale: `Competitor type: ${c.competitor_type}`,
      });
    }

    // ---------------- Assumptions → readiness (low confidence = risk to readiness) ----------------
    for (const a of assumptionsR.data ?? []) {
      const conf = clamp01((a.confidence ?? 0.5) as number);
      if (conf >= 0.7 || a.status === "validated") continue;
      drafts.push({
        category: "readiness",
        headline: `Unvalidated assumption`,
        body: a.assumption,
        impact: 0.55,
        urgency: 0.45,
        confidence: 1 - conf,
        proximity: 0.4,
        source_table: "gen:mission_assumptions",
        source_id: a.id,
        deep_link: `/missions/${missionId}/intel`,
        iris_rationale: `Confidence ${(conf * 100).toFixed(0)}%`,
      });
    }

    // ---------------- Persist ----------------
    // Wipe generator-owned rows for this mission, then bulk insert fresh ones.
    const { error: delErr } = await supabase
      .from("mission_radar_signals")
      .delete()
      .eq("mission_id", missionId)
      .like("source_table", "gen:%");
    if (delErr) throw new Error(`Failed to clear prior radar signals: ${delErr.message}`);

    const rows = drafts.map((d) => {
      const s = score(d);
      return {
        mission_id: missionId,
        category: d.category,
        headline: d.headline,
        body: d.body,
        impact: d.impact,
        urgency: d.urgency,
        confidence: d.confidence,
        proximity: d.proximity,
        score: s,
        ring: ring(s),
        severity: severity(s),
        source_table: d.source_table,
        source_id: d.source_id,
        deep_link: d.deep_link,
        iris_rationale: d.iris_rationale,
      };
    });

    let inserted = 0;
    if (rows.length > 0) {
      const { error: insErr, count } = await supabase
        .from("mission_radar_signals")
        .insert(rows, { count: "exact" });
      if (insErr) throw new Error(`Failed to write radar signals: ${insErr.message}`);
      inserted = count ?? rows.length;
    }

    // Snapshot for historical comparison (best-effort).
    try {
      await supabase
        .from("mission_radar_snapshots")
        .insert({ mission_id: missionId, signals: rows as unknown as object });
    } catch (e) {
      console.warn("[radar-generator] snapshot failed", e);
    }

    return { ok: true, inserted, generated_at: now.toISOString() };
  });
