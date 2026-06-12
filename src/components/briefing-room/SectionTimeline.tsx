import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { getTimeline } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";

function fmtShort(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}
function fmtLong(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  } catch {
    return "—";
  }
}
function daysBetween(deadline: string | null | undefined): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
function countdownColor(days: number | null): string {
  if (days == null) return "rgba(255,255,255,0.4)";
  if (days < 14) return "#f08080";
  if (days < 30) return "#EF9F27";
  return "#C49A2B";
}
function milestoneColor(days: number): string {
  if (days < 0) return "#f08080";
  if (days <= 3) return "#EF9F27";
  return "white";
}

export function SectionTimeline({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getTimeline);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "timeline", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });
  const days = daysBetween(data.submissionDeadline);
  const subColor = countdownColor(days);

  return (
    <SectionCard
      title="Mission Timeline"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=4`}
    >
      {/* Element 1 — Current phase banner */}
      <div
        className="rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3"
        style={{
          background: "rgba(196,154,43,0.07)",
          border: "1px solid rgba(196,154,43,0.3)",
        }}
      >
        <div style={{ color: "white", fontSize: 12 }}>
          {data.currentPhase ? (
            <>
              <span style={{ color: "rgba(255,255,255,0.5)" }}>Current phase: </span>
              <span style={{ color: "#C49A2B", fontWeight: 500 }}>{data.currentPhase.name}</span>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>
                {" · "}
                {fmtShort(data.currentPhase.startDate)} – {fmtShort(data.currentPhase.endDate)}
              </span>
            </>
          ) : (
            <span style={{ color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>
              No active phase right now.
            </span>
          )}
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: "rgba(255,255,255,0.5)" }}>Submission: </span>
          <span style={{ color: "white" }}>{fmtLong(data.submissionDeadline)}</span>
          <span style={{ color: subColor, marginLeft: 8 }}>
            · {days == null ? "—" : days < 0 ? `${Math.abs(days)} days past` : `${days} days remaining`}
          </span>
        </div>
      </div>

      {/* Element 2 — Phase rail */}
      {data.rail.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {data.rail.map((p: any) => {
            const base = {
              fontSize: 10,
              padding: "3px 10px",
              borderRadius: 20,
              display: "inline-flex" as const,
              alignItems: "center" as const,
              gap: 4,
            };
            if (p.status === "current") {
              return (
                <span key={p.id} style={{ ...base, background: "#C49A2B", color: "#0A0A0F", fontWeight: 500 }}>
                  {p.name}
                </span>
              );
            }
            if (p.status === "completed") {
              return (
                <span
                  key={p.id}
                  style={{
                    ...base,
                    background: "rgba(125,207,125,0.08)",
                    color: "rgba(255,255,255,0.5)",
                    border: "0.5px solid rgba(125,207,125,0.2)",
                  }}
                >
                  <Check className="h-2.5 w-2.5" style={{ color: "#7DCF7D" }} />
                  {p.name}
                </span>
              );
            }
            return (
              <span
                key={p.id}
                style={{
                  ...base,
                  background: "transparent",
                  color: "rgba(255,255,255,0.45)",
                  border: "0.5px solid rgba(255,255,255,0.15)",
                }}
              >
                {p.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Element 3 — Upcoming milestones */}
      <div className="mb-3">
        <div
          className="mb-2"
          style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}
        >
          Upcoming milestones (next 7 days)
        </div>
        {data.milestones.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic", fontSize: 11 }}>
            No milestones due this week.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {data.milestones.map((m: any) => {
              const c = milestoneColor(m.daysUntil);
              const dueDate = new Date(m.dueDate!);
              const dayName = dueDate.toLocaleDateString("en-US", { weekday: "short" });
              const dateText = dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const label =
                m.daysUntil < 0
                  ? `${Math.abs(m.daysUntil)}d overdue`
                  : m.daysUntil === 0
                    ? "today"
                    : `in ${m.daysUntil}d`;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-1.5 px-2 rounded"
                  style={{ background: "rgba(255,255,255,0.02)" }}
                >
                  <span style={{ color: c, fontSize: 12, fontWeight: 500 }}>{m.name}</span>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>
                    Due {dayName} {dateText}
                    <span style={{ color: c, marginLeft: 8 }}>{label}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Element 4 — View full timeline */}
      <Link
        to="/missions/$missionId/journey"
        params={{ missionId }}
        style={{ color: "#C49A2B", fontSize: 11 }}
        className="hover:opacity-80"
      >
        View full timeline →
      </Link>
    </SectionCard>
  );
}
