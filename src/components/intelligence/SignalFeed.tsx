/**
 * SignalFeed — recent intelligence_feed_items for a mission.
 * Uses the same table that IntelligencePanel's LiveIntelBlock queries:
 *   table:   intelligence_feed_items
 *   columns: id, headline, iris_assessment, source_name, source_url,
 *            category, created_at, iris_relevance_score
 *
 * The base table does not have a `signal_type` column, so we color the type
 * pill by `category` instead (federal_policy / state / research / competitive).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CATEGORY_TONE: Record<string, { label: string; color: string }> = {
  federal_policy: { label: "Federal Policy", color: "#3b82f6" },
  state: { label: "State", color: "#14b8a6" },
  research: { label: "Research", color: "#22c55e" },
  competitive: { label: "Competitive", color: "#ef4444" },
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function SignalFeed({ missionId }: { missionId: string }) {
  const { data: signals = [] } = useQuery({
    queryKey: ["signal-feed-strip", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("intelligence_feed_items")
        .select("id, headline, iris_assessment, source_name, category, created_at, iris_relevance_score")
        .eq("mission_id", missionId)
        .eq("is_dismissed", false)
        .order("created_at", { ascending: false })
        .limit(7);
      return data ?? [];
    },
    staleTime: 60_000,
  });

  if (signals.length === 0) {
    return (
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.5)",
          fontStyle: "italic",
          padding: 12,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
        }}
      >
        No signals detected yet. IRIS will surface relevant intelligence as monitoring progresses.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.45)",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        Recent Signals
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {signals.map((s: any) => {
          const tone = CATEGORY_TONE[String(s.category ?? "").toLowerCase()];
          const accent = tone?.color ?? "rgba(255,255,255,0.3)";
          return (
            <div
              key={s.id}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderLeft: `2px solid ${accent}`,
                borderRadius: 6,
                padding: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "white", lineHeight: 1.35, minWidth: 0 }}>
                  {s.headline}
                </div>
                {tone && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "2px 8px",
                      borderRadius: 999,
                      color: accent,
                      border: `1px solid ${accent}55`,
                      background: `${accent}10`,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    {tone.label}
                  </span>
                )}
              </div>

              {s.iris_assessment && (
                <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.5 }}>
                  {String(s.iris_assessment).slice(0, 120)}
                  {String(s.iris_assessment).length > 120 ? "…" : ""}
                </div>
              )}

              <div
                style={{
                  marginTop: 6,
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                {s.source_name && <span>{s.source_name}</span>}
                {s.source_name && <span>·</span>}
                <span>{timeAgo(s.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
