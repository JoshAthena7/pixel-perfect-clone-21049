import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Star } from "lucide-react";
import { getClientStory } from "@/lib/briefing-room.functions";
import { SectionCard, Empty } from "./SectionCard";

function asText(v: any): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") return v.text ?? v.title ?? v.label ?? JSON.stringify(v);
  return String(v ?? "");
}

export function SectionClientStory({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getClientStory);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "story", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });

  const allEmpty =
    data.strengths.length === 0 && data.differentiators.length === 0 && data.proofPoints.length === 0 && !data.successStory;

  return (
    <SectionCard
      title="Client Story"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=3`}
    >
      {allEmpty ? (
        <Empty>Client story not yet configured. Add it in Olympus.</Empty>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              className="rounded-lg p-4"
              style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
            >
              <div className="mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Client Strengths
              </div>
              {data.strengths.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic", fontSize: 11 }}>
                  Will be added in Olympus.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {data.strengths.map((s: any, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-3 w-3 mt-0.5 shrink-0" style={{ color: "#7DCF7D" }} />
                      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, lineHeight: 1.5 }}>{asText(s)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div
              className="rounded-lg p-4"
              style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
            >
              <div className="mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Key Differentiators
              </div>
              {data.differentiators.length === 0 ? (
                <div style={{ color: "rgba(255,255,255,0.4)", fontStyle: "italic", fontSize: 11 }}>
                  Will be added in Olympus.
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {data.differentiators.map((d: any, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <Star className="h-3 w-3 mt-0.5 shrink-0" style={{ color: "#C49A2B" }} />
                      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, lineHeight: 1.5 }}>{asText(d)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {data.proofPoints.length > 0 && (
            <div>
              <div className="mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Key Proof Points and Outcomes
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {data.proofPoints.slice(0, 6).map((p: any, i: number) => (
                  <div
                    key={i}
                    className="rounded-lg p-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
                  >
                    <div style={{ color: "#C49A2B", fontSize: 11, fontWeight: 500 }}>
                      {p.client ?? p.title ?? "Proof Point"}
                    </div>
                    <div className="mt-1" style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, lineHeight: 1.5 }}>
                      {asText(p.description ?? p.outcome ?? p)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.successStory && (
            <div
              className="rounded-lg p-4"
              style={{ background: "rgba(255,255,255,0.02)", border: "0.5px solid rgba(255,255,255,0.05)" }}
            >
              <div className="mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Success Story
              </div>
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.7 }}>
                {data.successStory}
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
