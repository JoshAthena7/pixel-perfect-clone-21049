import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getIntelligence } from "@/lib/briefing-room.functions";
import { SectionCard, Empty } from "./SectionCard";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type ThreatLevel = "High" | "Med" | "Low";

function threatFromConfidence(c?: string | null): ThreatLevel {
  const v = String(c ?? "").toLowerCase();
  if (v === "high") return "High";
  if (v === "low") return "Low";
  return "Med";
}

function ThreatBadge({ level }: { level: ThreatLevel }) {
  const palette =
    level === "High"
      ? { fg: "#f08080", bg: "rgba(224,74,74,0.12)" }
      : level === "Med"
      ? { fg: "#EF9F27", bg: "rgba(239,159,39,0.12)" }
      : { fg: "#7DCF7D", bg: "rgba(125,207,125,0.12)" };
  return (
    <span
      className="rounded"
      style={{
        fontSize: 9,
        padding: "1px 6px",
        color: palette.fg,
        background: palette.bg,
        fontWeight: 600,
        letterSpacing: "0.04em",
      }}
    >
      {level.toUpperCase()}
    </span>
  );
}

function SubCard({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col"
      style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
    >
      <div className="mb-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 500 }}>
        {title}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}

export function SectionIntelligence({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getIntelligence);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "intel", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });

  const stakeholders = (data.stakeholders ?? []).slice(0, 3);
  const stakeholderRest = Math.max(0, (data.stakeholders ?? []).length - stakeholders.length);

  const competitors: any[] = [
    ...(data.incumbent ? [{ ...data.incumbent, _incumbent: true }] : []),
    ...((data.competitors ?? []) as any[]),
  ];

  const oracleHref = `/missions/${missionId}/oracle`;

  return (
    <SectionCard
      title="Program & Market Intelligence"
      showAdminEdit={isAdmin}
      editInOlympusHref={oracleHref}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SubCard
          title="Key Stakeholders"
          footer={
            <Link
              to="/missions/$missionId/oracle"
              params={{ missionId }}
              search={{ tab: "stakeholders" } as never}
              style={{ color: "#C49A2B", fontSize: 10 }}
            >
              See all in IRIS →
            </Link>
          }
        >
          {stakeholders.length === 0 ? (
            <Empty>No stakeholders profiled yet.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {stakeholders.map((s: any, i: number) => (
                <li key={i} className="flex items-center gap-2.5">
                  <span
                    className="shrink-0 rounded-full inline-flex items-center justify-center"
                    style={{
                      width: 28,
                      height: 28,
                      background: "rgba(196,154,43,0.15)",
                      color: "#C49A2B",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {initials(s.name ?? "?")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ color: "white", fontSize: 11, fontWeight: 500 }}>
                      {s.name}
                    </div>
                    <div className="truncate" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>
                      {s.title || s.organization || s.stakeholder_type}
                    </div>
                  </div>
                </li>
              ))}
              {stakeholderRest > 0 && (
                <li style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontStyle: "italic" }}>
                  + {stakeholderRest} more
                </li>
              )}
            </ul>
          )}
        </SubCard>

        <SubCard
          title="Competitors"
          footer={
            <Link
              to="/missions/$missionId/oracle"
              params={{ missionId }}
              search={{ tab: "competitors" } as never}
              style={{ color: "#C49A2B", fontSize: 10 }}
            >
              Full profiles in IRIS →
            </Link>
          }
        >
          {competitors.length === 0 ? (
            <Empty>No competitors profiled.</Empty>
          ) : (
            <ul className="space-y-2">
              {competitors.slice(0, 5).map((c: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="truncate" style={{ color: "white", fontSize: 11, fontWeight: 500 }}>
                      {c.organization_name}
                    </span>
                    {c._incumbent && (
                      <span
                        className="rounded shrink-0"
                        style={{
                          fontSize: 8,
                          padding: "1px 5px",
                          color: "#f08080",
                          background: "rgba(224,74,74,0.12)",
                          fontWeight: 600,
                          letterSpacing: "0.05em",
                        }}
                      >
                        INCUMBENT
                      </span>
                    )}
                  </div>
                  <ThreatBadge level={threatFromConfidence(c.iris_confidence)} />
                </li>
              ))}
              {competitors.length > 5 && (
                <li style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontStyle: "italic" }}>
                  + {competitors.length - 5} more
                </li>
              )}
            </ul>
          )}
        </SubCard>
      </div>
    </SectionCard>
  );
}
