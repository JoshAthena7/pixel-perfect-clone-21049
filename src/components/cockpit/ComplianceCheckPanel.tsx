import { useState } from "react";
import { useQuestionCompliance } from "@/hooks/useQuestionCompliance";

const RISK_COLORS: Record<string, string> = {
  critical: "rgba(248,113,113,0.9)",
  high: "rgba(251,191,36,0.8)",
  medium: "rgba(255,255,255,0.5)",
  low: "rgba(255,255,255,0.3)",
};

const STATUS_ICONS: Record<string, { icon: string; color: string; label: string }> = {
  compliant: { icon: "✓", color: "rgba(74,222,128,0.8)", label: "Compliant" },
  conflict: { icon: "✗", color: "rgba(248,113,113,0.9)", label: "Conflict flagged" },
  not_applicable: { icon: "—", color: "rgba(255,255,255,0.3)", label: "Not applicable" },
  needs_review: { icon: "?", color: "rgba(251,191,36,0.8)", label: "Needs review" },
  pending: { icon: "○", color: "rgba(255,255,255,0.25)", label: "Not verified" },
};

export function ComplianceCheckPanel({
  questionId,
  missionId,
}: {
  questionId: string;
  missionId: string;
}) {
  const { checks, loading, stats, updateCheck } = useQuestionCompliance(questionId, missionId);
  const hasConflicts = stats.conflicts > 0;
  const allClear = stats.total > 0 && stats.pending === 0 && stats.conflicts === 0;
  const [expanded, setExpanded] = useState<boolean>(hasConflicts);
  const [activeNote, setActiveNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  if (loading) return null;
  if (checks.length === 0) return null;

  const borderColor = hasConflicts
    ? "rgba(248,113,113,0.3)"
    : allClear
      ? "rgba(74,222,128,0.2)"
      : "rgba(251,191,36,0.2)";
  const accentColor = hasConflicts
    ? "rgba(248,113,113,0.7)"
    : allClear
      ? "rgba(74,222,128,0.6)"
      : "rgba(251,191,36,0.5)";

  return (
    <div
      style={{
        margin: "12px 0",
        border: `1px solid ${borderColor}`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: "0 4px 4px 0",
        background: hasConflicts ? "rgba(248,113,113,0.03)" : "rgba(255,255,255,0.02)",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10 }}>{hasConflicts ? "⚠" : allClear ? "✓" : "○"}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.05em" }}>
            CONTRACT & SOW COMPLIANCE
          </span>
          <span
            style={{
              fontSize: 9,
              padding: "1px 6px",
              borderRadius: 10,
              background: hasConflicts
                ? "rgba(248,113,113,0.15)"
                : allClear
                  ? "rgba(74,222,128,0.1)"
                  : "rgba(251,191,36,0.1)",
              color: hasConflicts
                ? "rgba(248,113,113,0.9)"
                : allClear
                  ? "rgba(74,222,128,0.8)"
                  : "rgba(251,191,36,0.8)",
            }}
          >
            {hasConflicts
              ? `${stats.conflicts} conflict${stats.conflicts > 1 ? "s" : ""}`
              : allClear
                ? "All verified"
                : `${stats.pending} pending`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            {stats.verified}/{stats.total} checked
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{expanded ? "▾" : "▸"}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {checks.map((check) => {
            const ob = check.compliance_obligations;
            const riskColor = RISK_COLORS[ob?.risk_level ?? "medium"] ?? RISK_COLORS.medium;
            const statusConfig = STATUS_ICONS[check.verification_status] ?? STATUS_ICONS.pending;
            const isNoting = activeNote === check.id;
            const isResolved =
              check.verification_status === "compliant" || check.verification_status === "not_applicable";

            return (
              <div
                key={check.id}
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  background:
                    check.verification_status === "conflict"
                      ? "rgba(248,113,113,0.04)"
                      : check.verification_status === "compliant"
                        ? "rgba(74,222,128,0.02)"
                        : "transparent",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 3,
                      minHeight: 40,
                      background: riskColor,
                      borderRadius: 2,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 8,
                          padding: "1px 5px",
                          borderRadius: 2,
                          background:
                            ob?.document_type === "model_contract"
                              ? "rgba(167,139,250,0.15)"
                              : "rgba(96,165,250,0.15)",
                          color:
                            ob?.document_type === "model_contract"
                              ? "rgba(167,139,250,0.8)"
                              : "rgba(96,165,250,0.8)",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {ob?.document_type === "model_contract" ? "MODEL CONTRACT" : "SCOPE OF WORK"}
                      </span>
                      {ob?.section_reference && (
                        <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>{ob.section_reference}</span>
                      )}
                      <span
                        style={{
                          fontSize: 8,
                          color: riskColor,
                          marginLeft: "auto",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {ob?.risk_level}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.75)",
                        lineHeight: 1.5,
                        marginBottom: 6,
                      }}
                    >
                      {ob?.obligation_summary ?? ob?.obligation_text}
                    </div>

                    {check.verification_status === "pending" && check.iris_assessment && (
                      <div
                        style={{
                          fontSize: 9,
                          color: "rgba(196,154,43,0.7)",
                          fontStyle: "italic",
                          marginBottom: 8,
                        }}
                      >
                        ⚡ IRIS: {check.iris_assessment}
                      </div>
                    )}

                    {check.verification_note && (
                      <div
                        style={{
                          fontSize: 9,
                          color: "rgba(255,255,255,0.4)",
                          marginBottom: 6,
                          fontStyle: "italic",
                        }}
                      >
                        Note: {check.verification_note}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 9,
                          color: statusConfig.color,
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                        }}
                      >
                        {statusConfig.icon} {statusConfig.label}
                      </span>

                      {!isResolved && check.verification_status !== "conflict" && (
                        <>
                          <button
                            type="button"
                            onClick={() => updateCheck(check.id, "compliant")}
                            style={{
                              fontSize: 9,
                              padding: "2px 8px",
                              background: "rgba(74,222,128,0.08)",
                              border: "1px solid rgba(74,222,128,0.25)",
                              color: "rgba(74,222,128,0.8)",
                              borderRadius: 3,
                              cursor: "pointer",
                            }}
                          >
                            ✓ Compliant
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveNote(check.id);
                              setNoteText("");
                            }}
                            style={{
                              fontSize: 9,
                              padding: "2px 8px",
                              background: "rgba(248,113,113,0.08)",
                              border: "1px solid rgba(248,113,113,0.25)",
                              color: "rgba(248,113,113,0.8)",
                              borderRadius: 3,
                              cursor: "pointer",
                            }}
                          >
                            ✗ Flag conflict
                          </button>
                          <button
                            type="button"
                            onClick={() => updateCheck(check.id, "not_applicable")}
                            style={{
                              fontSize: 9,
                              padding: "2px 8px",
                              background: "transparent",
                              border: "1px solid rgba(255,255,255,0.1)",
                              color: "rgba(255,255,255,0.3)",
                              borderRadius: 3,
                              cursor: "pointer",
                            }}
                          >
                            — N/A
                          </button>
                        </>
                      )}

                      {(isResolved || check.verification_status === "conflict") && (
                        <button
                          type="button"
                          onClick={() => updateCheck(check.id, "pending")}
                          style={{
                            fontSize: 8,
                            padding: "2px 6px",
                            background: "transparent",
                            border: "none",
                            color: "rgba(255,255,255,0.25)",
                            cursor: "pointer",
                          }}
                        >
                          undo
                        </button>
                      )}
                    </div>

                    {isNoting && (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          placeholder="Describe the conflict (optional — but helps the lead resolve it)..."
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          rows={2}
                          style={{
                            width: "100%",
                            fontSize: 10,
                            background: "rgba(255,255,255,0.04)",
                            border: "1px solid rgba(248,113,113,0.3)",
                            borderRadius: 3,
                            color: "rgba(255,255,255,0.7)",
                            padding: "6px 8px",
                            resize: "none",
                            outline: "none",
                          }}
                        />
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => {
                              void updateCheck(check.id, "conflict", noteText || undefined);
                              setActiveNote(null);
                            }}
                            style={{
                              fontSize: 9,
                              padding: "3px 10px",
                              background: "rgba(248,113,113,0.15)",
                              border: "1px solid rgba(248,113,113,0.4)",
                              color: "rgba(248,113,113,0.9)",
                              borderRadius: 3,
                              cursor: "pointer",
                            }}
                          >
                            Submit conflict
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveNote(null)}
                            style={{
                              fontSize: 9,
                              padding: "3px 8px",
                              background: "transparent",
                              border: "none",
                              color: "rgba(255,255,255,0.3)",
                              cursor: "pointer",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div style={{ padding: "8px 14px", fontSize: 9, color: "rgba(255,255,255,0.2)" }}>
            Cross-check your planned response against these obligations before writing in your environment.
            {stats.conflicts > 0 && (
              <span style={{ color: "rgba(248,113,113,0.6)", marginLeft: 6 }}>
                ⚠ {stats.conflicts} conflict{stats.conflicts > 1 ? "s" : ""} flagged — your lead will see these.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
