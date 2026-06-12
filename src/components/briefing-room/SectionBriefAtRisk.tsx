import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMissionMap, getRisks } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";

type RiskRow = {
  id: string;
  title: string;
  status: string;
  kind: "question" | "risk";
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  draft_complete: "Draft Complete",
  under_review: "Under Review",
  complete: "Complete",
  blocked: "Blocked",
};

export function SectionBriefAtRisk({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const mapFn = useServerFn(getMissionMap);
  const risksFn = useServerFn(getRisks);
  const { data: map } = useSuspenseQuery({
    queryKey: ["briefing", "map", missionId],
    queryFn: () => mapFn({ data: { missionId } }),
    staleTime: 60_000,
  });
  const { data: risks } = useSuspenseQuery({
    queryKey: ["briefing", "risks", missionId],
    queryFn: () => risksFn({ data: { missionId } }),
    staleTime: 60_000,
  });
  const [expanded, setExpanded] = useState(false);

  const atRiskQuestions: RiskRow[] = (map.sections ?? []).flatMap((s: any) =>
    (s.questions ?? [])
      .filter((q: any) => q.health === "at_risk")
      .map((q: any) => ({
        id: q.id,
        title: `${q.number ? `Q${q.number} — ` : ""}${String(q.text ?? "").slice(0, 80)}`,
        status: STATUS_LABEL[q.status ?? "not_started"] ?? "Not Started",
        kind: "question" as const,
      })),
  );

  const highRisks: RiskRow[] = ((risks.items ?? []) as any[])
    .filter((r) => r.level === "HIGH")
    .map((r) => ({ id: r.id, title: r.title, status: r.kind === "conflict" ? "Conflict" : "Risk", kind: "risk" as const }));

  const all = [...highRisks, ...atRiskQuestions];
  const visible = expanded ? all : all.slice(0, 2);
  const more = all.length - visible.length;

  return (
    <SectionCard
      title="Mission Map & Risks"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=4`}
    >
      {all.length === 0 ? (
        <div
          className="rounded-lg p-3"
          style={{
            background: "rgba(26,122,74,0.07)",
            border: "0.5px solid rgba(26,122,74,0.25)",
            color: "#7DCF7D",
            fontSize: 12,
          }}
        >
          No at-risk items. Mission is on track.
        </div>
      ) : (
        <div className="space-y-1.5">
          {visible.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
              style={{
                background: "rgba(224,74,74,0.06)",
                border: "0.5px solid rgba(224,74,74,0.2)",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 2,
                    color: "#f08080",
                    background: "rgba(224,74,74,0.15)",
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    flexShrink: 0,
                  }}
                >
                  AT RISK
                </span>
                <span className="truncate" style={{ color: "white", fontSize: 11 }}>
                  {r.title}
                </span>
              </div>
              <span className="shrink-0" style={{ color: "rgba(255,255,255,0.55)", fontSize: 10 }}>
                {r.status}
              </span>
            </div>
          ))}
          {more > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="hover:underline"
              style={{
                color: "#C49A2B",
                fontSize: 11,
                background: "transparent",
                border: 0,
                padding: "4px 0 0",
                cursor: "pointer",
              }}
            >
              + {more} more
            </button>
          )}
          {expanded && all.length > 2 && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="hover:underline"
              style={{
                color: "rgba(255,255,255,0.5)",
                fontSize: 11,
                background: "transparent",
                border: 0,
                padding: "4px 0 0",
                cursor: "pointer",
              }}
            >
              Show less
            </button>
          )}
        </div>
      )}
      <div
        className="mt-3 pt-2 flex flex-wrap gap-x-4"
        style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 10 }}
      >
        <span>{map.totals.total} total</span>
        <span>{map.totals.complete} complete</span>
        <span>{map.totals.inProgress} in progress</span>
        <span>{map.totals.notStarted} not started</span>
        <span style={{ color: map.totals.atRisk > 0 ? "#f08080" : "rgba(255,255,255,0.4)" }}>
          {map.totals.atRisk} at risk
        </span>
      </div>
    </SectionCard>
  );
}
