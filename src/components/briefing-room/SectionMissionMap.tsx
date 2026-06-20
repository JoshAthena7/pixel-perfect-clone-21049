import { Fragment } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMissionMap } from "@/lib/briefing-room.functions";
import { SectionCard, Empty } from "./SectionCard";
import { useIsMobile } from "@/hooks/use-mobile";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  not_started: { label: "Not Started", color: "rgba(255,255,255,0.45)" },
  in_progress: { label: "In Progress", color: "#EF9F27" },
  draft_complete: { label: "Draft Complete", color: "#7BA7E1" },
  under_review: { label: "Under Review", color: "#B79CE1" },
  complete: { label: "Complete", color: "#7DCF7D" },
  blocked: { label: "Blocked", color: "#f08080" },
};

const CONF_COLOR: Record<string, string> = {
  high: "#7DCF7D",
  medium: "#EF9F27",
  low: "#f08080",
};

function StatusChip({ status }: { status: string | null }) {
  const s = STATUS_LABEL[status ?? "not_started"] ?? STATUS_LABEL.not_started;
  return (
    <span
      className="inline-flex items-center rounded-sm"
      style={{
        fontSize: 9,
        padding: "1px 6px",
        color: s.color,
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {s.label}
    </span>
  );
}

function RiskChip({ health }: { health: string | null }) {
  if (health === "at_risk") {
    return (
      <span style={{ fontSize: 9, color: "#f08080", padding: "1px 6px", background: "rgba(224,74,74,0.1)", borderRadius: 2 }}>
        At Risk
      </span>
    );
  }
  if (health === "watch") {
    return (
      <span style={{ fontSize: 9, color: "#EF9F27", padding: "1px 6px", background: "rgba(239,159,39,0.1)", borderRadius: 2 }}>
        WATCH
      </span>
    );
  }
  return <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>;
}

export function SectionMissionMap({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getMissionMap);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "map", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });
  const isMobile = useIsMobile();

  return (
    <SectionCard
      title="Mission Map"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=4`}
    >
      {data.sections.length === 0 ? (
        <Empty>No sections defined yet. Configure them in Olympus.</Empty>
      ) : isMobile ? (
        <div className="space-y-4">
          {data.sections.map((s: any) => (
            <div key={s.id}>
              <div
                className="mb-2 px-2 py-1 rounded"
                style={{ background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 500 }}
              >
                {s.number ? `${s.number} · ` : ""}{s.name}
              </div>
              {s.questions.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic", fontSize: 11 }}>Will be added in Olympus.</div>
              ) : (
                <ul className="space-y-2">
                  {s.questions.map((q: any) => (
                    <li
                      key={q.id}
                      className="rounded-lg p-3 space-y-1.5"
                      style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
                    >
                      <div style={{ color: "white", fontSize: 11, fontWeight: 500 }}>
                        {q.number ? `Q${q.number} — ` : ""}{String(q.text ?? "").slice(0, 100)}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs" style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                        <div>Writer: <span style={{ color: "rgba(255,255,255,0.75)" }}>{q.writer ?? "—"}</span></div>
                        <div>SME: <span style={{ color: "rgba(255,255,255,0.75)" }}>{q.sme ?? "—"}</span></div>
                      </div>
                      <div className="flex gap-2 items-center">
                        <StatusChip status={q.status} />
                        <span style={{ color: CONF_COLOR[q.confidence] ?? "rgba(255,255,255,0.25)", fontSize: 10 }}>
                          {q.confidence ?? "—"}
                        </span>
                        <RiskChip health={q.health} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 11 }}>
            <thead>
              <tr style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th className="text-left py-1.5 pl-3 font-medium">Question</th>
                <th className="text-left py-1.5 px-2 font-medium">Writer</th>
                <th className="text-left py-1.5 px-2 font-medium">SME</th>
                <th className="text-left py-1.5 px-2 font-medium">Status</th>
                <th className="text-left py-1.5 px-2 font-medium">Confidence</th>
                <th className="text-left py-1.5 px-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s: any) => (
                <Fragment key={s.id}>
                  <tr key={`s-${s.id}`}>
                    <td
                      colSpan={6}
                      className="py-1.5 pl-2"
                      style={{ background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 500 }}
                    >
                      {s.number ? `${s.number} · ` : ""}{s.name}
                    </td>
                  </tr>
                  {s.questions.length === 0 ? (
                    <tr key={`s-${s.id}-empty`}>
                      <td colSpan={6} className="py-2 pl-8" style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic" }}>
                        Will be added in Olympus.
                      </td>
                    </tr>
                  ) : (
                    s.questions.map((q: any, i: number) => (
                      <tr
                        key={q.id}
                        style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}
                      >
                        <td className="py-1.5 pl-8 pr-2" style={{ color: "white" }}>
                          <span style={{ color: "rgba(255,255,255,0.4)" }}>{q.number ? `Q${q.number} ` : ""}</span>
                          {String(q.text ?? "").slice(0, 90)}{(q.text ?? "").length > 90 ? "…" : ""}
                        </td>
                        <td className="py-1.5 px-2" style={{ color: "rgba(255,255,255,0.7)" }}>{q.writer ?? "—"}</td>
                        <td className="py-1.5 px-2" style={{ color: "rgba(255,255,255,0.7)" }}>{q.sme ?? "—"}</td>
                        <td className="py-1.5 px-2"><StatusChip status={q.status} /></td>
                        <td className="py-1.5 px-2" style={{ color: CONF_COLOR[q.confidence] ?? "rgba(255,255,255,0.25)" }}>
                          {q.confidence ?? "—"}
                        </td>
                        <td className="py-1.5 px-2"><RiskChip health={q.health} /></td>
                      </tr>
                    ))
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 pt-3" style={{ borderTop: "0.5px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
        {data.totals.total} total · {data.totals.complete} complete · {data.totals.inProgress} in progress · {data.totals.notStarted} not started · {data.totals.atRisk} at risk
      </div>
    </SectionCard>
  );
}
