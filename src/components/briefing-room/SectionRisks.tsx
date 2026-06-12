import { useState } from "react";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getRisks } from "@/lib/briefing-room.functions";
import { resolveConflict } from "@/lib/iris-conflicts.functions";
import { SectionCard } from "./SectionCard";

type RiskItem = {
  id: string;
  level: "HIGH" | "WATCH";
  kind: "risk" | "question" | "sos" | "conflict";
  title: string;
  description: string;
  createdAt: string;
  conflictId?: string;
  detectedFrom?: string | null;
  canResolve?: boolean;
};

export function SectionRisks({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getRisks);
  const resolveFn = useServerFn(resolveBriefingConflict);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "risks", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const items = (data.items as RiskItem[]).filter((i) => !hidden.has(i.id));

  async function onResolve(item: RiskItem) {
    if (!item.conflictId) return;
    setHidden((s) => new Set(s).add(item.id));
    setConfirmingId(null);
    try {
      await resolveFn({ data: { missionId, conflictId: item.conflictId } });
      qc.invalidateQueries({ queryKey: ["briefing", "risks", missionId] });
      qc.invalidateQueries({ queryKey: ["briefing", "snapshot", missionId] });
    } catch (e) {
      // rollback
      setHidden((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
      console.error("Failed to resolve conflict", e);
    }
  }

  return (
    <SectionCard
      title="Risks & Watch Items"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=10`}
    >
      {items.length === 0 ? (
        <div
          className="rounded-lg p-4"
          style={{
            background: "rgba(26,122,74,0.07)",
            border: "0.5px solid rgba(26,122,74,0.25)",
            color: "#7DCF7D",
            fontSize: 12,
          }}
        >
          No active risks. Mission is on track.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => {
            const isHigh = r.level === "HIGH";
            const isConflict = r.kind === "conflict";
            return (
              <div
                key={r.id}
                className="rounded-lg p-3"
                style={{
                  background: isConflict
                    ? "rgba(239,159,39,0.04)"
                    : isHigh
                    ? "rgba(224,74,74,0.05)"
                    : "rgba(239,159,39,0.05)",
                  border: `0.5px solid ${
                    isConflict
                      ? "rgba(239,159,39,0.15)"
                      : isHigh
                      ? "rgba(224,74,74,0.2)"
                      : "rgba(239,159,39,0.2)"
                  }`,
                }}
              >
                <div className="flex items-start gap-2">
                  <span
                    style={{
                      fontSize: 9,
                      padding: "1px 6px",
                      borderRadius: 2,
                      color: isHigh ? "#f08080" : "#EF9F27",
                      background: isHigh ? "rgba(224,74,74,0.12)" : "rgba(239,159,39,0.12)",
                      letterSpacing: "0.05em",
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {r.level}
                  </span>
                  {isConflict && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#EF9F27",
                        fontWeight: 500,
                        letterSpacing: "0.04em",
                      }}
                    >
                      DECISION CONFLICT
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>{r.title}</div>
                    {isConflict ? (
                      <>
                        {r.description && (
                          <div
                            className="mt-1"
                            style={{ color: "rgba(255,255,255,0.65)", fontSize: 10, lineHeight: 1.5 }}
                          >
                            {r.description}
                          </div>
                        )}
                        {r.detectedFrom && (
                          <div
                            className="mt-1"
                            style={{
                              color: "rgba(255,255,255,0.4)",
                              fontSize: 9,
                              fontStyle: "italic",
                            }}
                          >
                            Detected from: {r.detectedFrom}
                          </div>
                        )}
                        {r.canResolve && (
                          <div className="mt-2">
                            {confirmingId === r.id ? (
                              <span className="inline-flex items-center gap-2" style={{ fontSize: 9 }}>
                                <span style={{ color: "rgba(255,255,255,0.55)" }}>Confirm resolve?</span>
                                <button
                                  onClick={() => onResolve(r)}
                                  style={{ color: "#C49A2B", fontWeight: 600 }}
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setConfirmingId(null)}
                                  style={{ color: "rgba(255,255,255,0.4)" }}
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmingId(r.id)}
                                style={{ color: "#C49A2B", fontSize: 9 }}
                              >
                                Resolve →
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      r.description && (
                        <div
                          className="mt-1"
                          style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, lineHeight: 1.5 }}
                        >
                          {r.description}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
