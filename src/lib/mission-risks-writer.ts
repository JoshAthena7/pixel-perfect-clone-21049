// Centralized writer for IRIS-generated mission_risks rows.
//
// After inserting the risks (admin privileges, never blocks UI), fires a
// background pattern check per row against the oracle_risk_patterns
// library. The pattern check is fire-and-forget: it writes a historical
// note onto the risk row when matched, and always upserts the pattern
// library to keep it current.
//
// Failures are logged to the server console and never surfaced.

export type MissionRiskInput = {
  mission_id: string;
  title: string;
  description?: string | null;
  severity?: "critical" | "high" | "medium" | "low" | string | null;
  owner?: string | null;
  question_id?: string | null;
  status?: string | null;
};

export function writeIrisMissionRisks(inputs: MissionRiskInput[]): void {
  if (!inputs.length) return;
  void (async () => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rows = inputs.map((i) => ({
        mission_id: i.mission_id,
        title: (i.title ?? "").slice(0, 280),
        description: i.description ?? null,
        severity: i.severity ?? null,
        owner: i.owner ?? null,
        question_id: i.question_id ?? null,
        status: i.status ?? "active",
        created_by_system: true,
      }));
      const { data, error } = await supabaseAdmin
        .from("mission_risks")
        .insert(rows)
        .select("id, mission_id");
      if (error) {
        console.error("[mission-risks] insert failed", error.message);
        return;
      }
      const inserted = (data ?? []) as { id: string; mission_id: string }[];
      const { triggerRiskPatternCheck } = await import("@/lib/iris-risk-pattern-check.server");
      for (const r of inserted) {
        triggerRiskPatternCheck({ missionId: r.mission_id, riskId: r.id });
      }
    } catch (e) {
      console.error("[mission-risks] unexpected write failure", e);
    }
  })();
}
