import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSignals } from "@/lib/briefing-room.functions";
import { SectionCard, Empty } from "./SectionCard";

const TYPE_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  daily_pulse: { label: "DAILY PULSE", color: "#B79CE1", bg: "rgba(127,119,221,0.07)", border: "rgba(127,119,221,0.2)" },
  pm_update: { label: "PM UPDATE", color: "#EF9F27", bg: "rgba(239,159,39,0.06)", border: "rgba(239,159,39,0.2)" },
  sos: { label: "SOS", color: "#f08080", bg: "rgba(224,74,74,0.06)", border: "rgba(224,74,74,0.2)" },
  update_reality: { label: "UPDATE", color: "#7BA7E1", bg: "rgba(123,167,225,0.06)", border: "rgba(123,167,225,0.2)" },
};

function relTime(s: string): string {
  const ms = Date.now() - new Date(s).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function SectionSignals({ missionId, isAdmin }: { missionId: string; isAdmin: boolean }) {
  const fn = useServerFn(getSignals);
  const { data } = useSuspenseQuery({
    queryKey: ["briefing", "signals", missionId],
    queryFn: () => fn({ data: { missionId } }),
    staleTime: 30_000,
  });
  return (
    <SectionCard
      title="Daily Leadership Signals"
      showAdminEdit={isAdmin}
      editInOlympusHref={`/missions/${missionId}/flight-deck`}
    >
      {data.signals.length === 0 ? (
        <Empty>No signals yet. Leadership signals appear here as the mission progresses.</Empty>
      ) : (
        <div className="space-y-2">
          {data.signals.map((s) => {
            const t = TYPE_META[s.type] ?? TYPE_META.update_reality;
            return (
              <div
                key={s.id}
                className="rounded-lg p-3"
                style={{ background: t.bg, border: `0.5px solid ${t.border}` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    style={{
                      fontSize: 9,
                      color: t.color,
                      padding: "1px 6px",
                      borderRadius: 2,
                      background: "rgba(255,255,255,0.04)",
                      letterSpacing: "0.05em",
                      fontWeight: 600,
                    }}
                  >
                    {t.label}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>
                    {s.from ? `${s.from} · ` : ""}{relTime(s.createdAt)}
                  </span>
                </div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, lineHeight: 1.6 }}>
                  {s.body || <span style={{ fontStyle: "italic", opacity: 0.6 }}>(no message)</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
