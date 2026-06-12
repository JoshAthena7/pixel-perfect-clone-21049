import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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

function relTime(s: string | null | undefined): string {
  if (!s) return "";
  const ms = Date.now() - new Date(s).getTime();
  const d = Math.floor(ms / 86400000);
  if (d < 1) return "today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function SubCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
    >
      <div className="mb-3" style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 500 }}>
        {title}
      </div>
      {children}
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
  return (
    <SectionCard
      title="Program & Market Intelligence"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/missions/${missionId}/oracle`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <SubCard title="Key Stakeholders">
          {data.stakeholders.length === 0 ? (
            <Empty>No stakeholders profiled yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {data.stakeholders.map((s: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className="shrink-0 rounded-full inline-flex items-center justify-center"
                    style={{
                      width: 24, height: 24,
                      background: "rgba(196,154,43,0.15)",
                      color: "#C49A2B",
                      fontSize: 9, fontWeight: 600,
                    }}
                  >
                    {initials(s.name ?? "?")}
                  </span>
                  <div className="min-w-0">
                    <div style={{ color: "white", fontSize: 11, fontWeight: 500 }} className="truncate">{s.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }} className="truncate">{s.title || s.organization}</div>
                    {Array.isArray(s.public_priorities) && s.public_priorities.length > 0 && (
                      <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontStyle: "italic" }}>
                        {String(s.public_priorities[0]).slice(0, 80)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SubCard>

        <SubCard title="Incumbent Analysis">
          {!data.incumbent ? (
            <Empty>No incumbent profiled yet.</Empty>
          ) : (
            <div className="space-y-2">
              <div style={{ color: "white", fontSize: 11, fontWeight: 500 }}>{data.incumbent.organization_name}</div>
              {data.incumbent.likely_narrative && (
                <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, lineHeight: 1.5 }}>
                  {data.incumbent.likely_narrative}
                </div>
              )}
              {Array.isArray(data.incumbent.known_weaknesses) && data.incumbent.known_weaknesses.length > 0 && (
                <div style={{ color: "rgba(240,128,128,0.7)", fontSize: 10, fontStyle: "italic" }}>
                  Weakness: {String(data.incumbent.known_weaknesses[0])}
                </div>
              )}
            </div>
          )}
        </SubCard>

        <SubCard title="Competitor Analysis">
          {data.competitors.length === 0 ? (
            <Empty>No competitors profiled.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.competitors.map((c: any, i: number) => (
                <li key={i}>
                  <div style={{ color: "white", fontSize: 11, fontWeight: 500 }}>{c.organization_name}</div>
                  {c.likely_narrative && (
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontStyle: "italic", lineHeight: 1.5 }}>
                      {c.likely_narrative}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SubCard>

        <SubCard title="Political Environment">
          {data.policyNodes.length === 0 && data.politicalFeeds.length === 0 ? (
            <Empty>No political signals recorded.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.policyNodes.map((n: any, i: number) => (
                <li key={`p-${i}`}>
                  <div style={{ color: "white", fontSize: 11 }}>{n.label}</div>
                  {n.description && (
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{String(n.description).slice(0, 120)}</div>
                  )}
                </li>
              ))}
              {data.politicalFeeds.map((f: any, i: number) => (
                <li key={`pf-${i}`}>
                  <div style={{ color: "white", fontSize: 11 }}>{f.headline}</div>
                </li>
              ))}
            </ul>
          )}
        </SubCard>

        <SubCard title="Regulatory Environment">
          {data.regulatoryNodes.length === 0 ? (
            <Empty>No regulatory signals recorded.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.regulatoryNodes.map((n: any, i: number) => (
                <li key={i}>
                  <div style={{ color: "white", fontSize: 11 }}>{n.label}</div>
                  {n.description && (
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10 }}>{String(n.description).slice(0, 120)}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SubCard>

        <SubCard title="Recent Developments">
          {data.recentFeeds.length === 0 ? (
            <Empty>No recent intelligence.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.recentFeeds.map((f: any, i: number) => (
                <li key={i}>
                  <div style={{ color: "white", fontSize: 11 }} className="truncate">{f.headline}</div>
                  {f.iris_assessment && (
                    <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, fontStyle: "italic" }}>
                      {String(f.iris_assessment).slice(0, 110)}
                    </div>
                  )}
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }} className="mt-0.5">
                    {relTime(f.published_at)}{f.source_name ? ` · ${f.source_name}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SubCard>
      </div>
      <div className="mt-4" style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontStyle: "italic" }}>
        Intelligence surfaced from Oracle. Add sources and feeds in Olympus to enrich this view.
      </div>
    </SectionCard>
  );
}
