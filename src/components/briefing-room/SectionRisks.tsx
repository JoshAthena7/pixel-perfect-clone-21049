import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRisks } from "@/lib/briefing-room.functions";
import { SectionCard } from "./SectionCard";

export function SectionRisks({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getRisks);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "risks", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 60_000,
  });

  return (
    <SectionCard
      title="Risks & Watch Items"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/olympus/missions/${missionId}/wizard?step=10`}
    >
      {data.items.length === 0 ? (
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
          {data.items.map((r) => {
            const isHigh = r.level === "HIGH";
            return (
              <div
                key={r.id}
                className="rounded-lg p-3"
                style={{
                  background: isHigh ? "rgba(224,74,74,0.05)" : "rgba(239,159,39,0.05)",
                  border: `0.5px solid ${isHigh ? "rgba(224,74,74,0.2)" : "rgba(239,159,39,0.2)"}`,
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
                  <div className="min-w-0 flex-1">
                    <div style={{ color: "white", fontSize: 12, fontWeight: 500 }}>{r.title}</div>
                    {r.description && (
                      <div className="mt-1" style={{ color: "rgba(255,255,255,0.55)", fontSize: 10, lineHeight: 1.5 }}>
                        {r.description}
                      </div>
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
