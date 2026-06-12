import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getNorthStar } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";
import { extractListText } from "./format";

function asText(v: any): string {
  return extractListText(v);
}

const MutedItalic = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic", fontSize: 12 }}>{children}</div>
);


export function SectionNorthStar({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getNorthStar);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "northstar", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });

  // Merge evaluator stakeholders' public_priorities into evaluator priorities if WS list is empty
  const evalPriorities: string[] = data.evaluatorPriorities.length > 0
    ? data.evaluatorPriorities.map(asText)
    : data.evaluators.flatMap((e: any) =>
        Array.isArray(e.public_priorities) ? e.public_priorities.map(asText) : [],
      );

  return (
    <SectionCard
      title="The North Star"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=3`}
    >
      {/* A — Central Claim (most prominent element in the Briefing Room) */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{
          background: "rgba(196,154,43,0.07)",
          borderLeft: "3px solid #C49A2B",
          border: "1px solid rgba(196,154,43,0.2)",
          borderLeftWidth: 3,
          borderLeftColor: "#C49A2B",
        }}
      >
        <div
          style={{
            color: "#C49A2B",
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          Central Claim — Why should the evaluator choose our client?
        </div>
        <div
          className="mt-3"
          style={
            data.centralClaim
              ? {
                  color: "white",
                  fontSize: 16,
                  fontStyle: "italic",
                  fontWeight: 500,
                  lineHeight: 1.7,
                }
              : {
                  color: "rgba(196,154,43,0.7)",
                  fontSize: 14,
                  fontStyle: "italic",
                  lineHeight: 1.6,
                }
          }
        >
          {data.centralClaim ??
            "Central Claim not yet set. This is the most important field in the entire platform — set it in Olympus before BLAST OFF."}
        </div>
      </div>

      {/* B — Win Themes */}
      <div className="mb-5">
        <div className="mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Win Themes — every writer reinforces these
        </div>
        <div className="flex flex-wrap gap-2">
          {data.winThemes.length === 0 ? (
            <MutedItalic>Win Themes will be set in Olympus</MutedItalic>
          ) : (
            data.winThemes.map((t: any, i: number) => (
              <span
                key={i}
                className="inline-flex items-center"
                style={{
                  background: "rgba(196,154,43,0.08)",
                  border: "0.5px solid rgba(196,154,43,0.2)",
                  color: "#C49A2B",
                  fontSize: 10,
                  padding: "4px 10px",
                  borderRadius: 20,
                }}
              >
                {asText(t)}
              </span>
            ))
          )}
        </div>
      </div>

      {/* C + D side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Evaluator Priorities */}
        <div>
          <div className="mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Evaluator Priorities
          </div>
          {evalPriorities.length === 0 ? (
            <MutedItalic>Evaluator priorities will be configured in Olympus before BLAST OFF.</MutedItalic>
          ) : (
            <ul className="space-y-1.5">
              {evalPriorities.slice(0, 8).map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 shrink-0 rounded-full"
                    style={{ width: 4, height: 4, background: "#C49A2B" }}
                  />
                  <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 1.5 }}>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Things to Avoid */}
        <div
          className="rounded-lg p-4"
          style={{
            background: "rgba(224,74,74,0.04)",
            border: "0.5px solid rgba(224,74,74,0.15)",
          }}
        >
          <div className="mb-2" style={{ color: "rgba(240,128,128,0.7)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Things We Must Avoid
          </div>
          {data.thingsToAvoid.length === 0 ? (
            <MutedItalic>Win strategy risks will be set in Olympus.</MutedItalic>
          ) : (
            <ul className="space-y-1.5">
              {data.thingsToAvoid.map((t: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 shrink-0 rounded-full"
                    style={{ width: 4, height: 4, background: "#f08080" }}
                  />
                  <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 11, lineHeight: 1.5 }}>{asText(t)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
