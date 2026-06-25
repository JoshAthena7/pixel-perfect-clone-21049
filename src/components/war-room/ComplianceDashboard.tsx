import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ConflictRow = {
  verification_status: string;
  compliance_obligations: {
    risk_level: string | null;
    document_type: string | null;
    obligation_summary: string | null;
    section_reference: string | null;
  } | null;
  mission_questions: { question_number: string | null } | null;
};

export function useMissionComplianceStats(missionId: string) {
  return useQuery({
    queryKey: ["mission-compliance-stats", missionId],
    enabled: !!missionId,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("question_compliance_checks")
        .select(
          `verification_status,
           compliance_obligations(risk_level, document_type, obligation_summary, section_reference),
           mission_questions(question_number)`,
        )
        .eq("mission_id", missionId);

      const rows = (data ?? []) as ConflictRow[];
      const total = rows.length;
      const verified = rows.filter(
        (c) => c.verification_status === "compliant" || c.verification_status === "not_applicable",
      ).length;
      const pending = rows.filter((c) => c.verification_status === "pending").length;
      const conflictRows = rows.filter((c) => c.verification_status === "conflict");

      return {
        total,
        verified,
        pending,
        conflicts: conflictRows.length,
        conflictRows,
      };
    },
  });
}

export function ComplianceDashboard({ missionId }: { missionId: string }) {
  const { data } = useMissionComplianceStats(missionId);

  if (!data) {
    return (
      <div style={{ padding: 16, color: "rgba(255,255,255,0.3)", fontSize: 11 }}>Loading compliance…</div>
    );
  }

  if (data.total === 0) {
    return (
      <div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.3)", fontSize: 11 }}>
        No State Model Contract or Scope of Work uploaded yet.
        <div style={{ marginTop: 6, color: "rgba(96,165,250,0.7)", fontSize: 10 }}>
          Upload in Signal Review →
        </div>
      </div>
    );
  }

  const pct = Math.round((data.verified / data.total) * 100);
  const barColor =
    data.conflicts > 0
      ? "rgba(248,113,113,0.7)"
      : pct === 100
        ? "rgba(74,222,128,0.7)"
        : "rgba(196,154,43,0.7)";

  return (
    <div style={{ padding: 14 }}>
      {/* Summary */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "center" }}>
        <div style={{ textAlign: "center", minWidth: 56 }}>
          <div style={{ fontSize: 24, fontWeight: 400, color: "rgba(255,255,255,0.9)" }}>{pct}%</div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>verified</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: barColor,
                borderRadius: 2,
                transition: "width 600ms ease",
              }}
            />
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
            {data.verified} verified · {data.pending} pending · {data.conflicts} conflicts
          </div>
        </div>
      </div>

      {data.conflicts > 0 && (
        <div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(248,113,113,0.7)",
              marginBottom: 8,
              letterSpacing: "0.05em",
            }}
          >
            ⚠ CONFLICTS FLAGGED — REQUIRE RESOLUTION
          </div>
          {data.conflictRows.map((c, i) => (
            <div
              key={i}
              style={{
                padding: "8px 10px",
                background: "rgba(248,113,113,0.05)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 4,
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                  Q{c.mission_questions?.question_number ?? "?"}
                </span>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>
                  {c.compliance_obligations?.document_type === "model_contract" ? "Model Contract" : "SOW"}
                  {c.compliance_obligations?.section_reference
                    ? ` · ${c.compliance_obligations.section_reference}`
                    : ""}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
                {c.compliance_obligations?.obligation_summary ?? "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
