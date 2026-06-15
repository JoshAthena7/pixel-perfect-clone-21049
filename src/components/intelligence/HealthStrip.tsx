import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function timeAgo(ts: string | null): string {
  if (!ts) return "unknown";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function CoverageBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "#4caf7d" : value >= 45 ? "#f0c040" : "#e05252";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
        <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
        <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}>{value}%</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            width: `${value}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.6s ease",
          }}
        />
      </div>
    </div>
  );
}

export function HealthStrip({ missionId }: { missionId: string }) {
  const { data: health } = useQuery({
    queryKey: ["intel-health", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_intelligence_health")
        .select("*")
        .eq("mission_id", missionId)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  if (!health) {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          padding: 14,
          fontSize: 12,
          color: "rgba(255,255,255,0.55)",
          fontStyle: "italic",
        }}
      >
        IRIS is warming up. Intelligence will appear shortly.
      </div>
    );
  }

  const statusColor =
    health.iris_status === "active"
      ? "#4caf7d"
      : health.iris_status === "needs_review"
        ? "#f0c040"
        : "rgba(255,255,255,0.3)";
  const statusLabel =
    health.iris_status === "active"
      ? "IRIS Active"
      : health.iris_status === "needs_review"
        ? "IRIS Needs Review"
        : "IRIS Offline";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 14,
        display: "grid",
        gridTemplateColumns: "minmax(140px,1fr) minmax(150px,1.2fr) minmax(220px,1.6fr)",
        gap: 18,
        alignItems: "center",
      }}
    >
      {/* Status */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: statusColor,
              animation: health.iris_status === "active" ? "iris-pulse 2s ease-in-out infinite" : undefined,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 12, color: "white", fontWeight: 600 }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Last scan: {timeAgo(health.last_scan_at)}</div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
          Last signal: {timeAgo(health.last_signal_at)}
        </div>
      </div>

      {/* Coverage bars */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <CoverageBar label="Sources" value={health.source_coverage_pct} />
        <CoverageBar label="Stakeholder" value={health.stakeholder_visibility_pct} />
        <CoverageBar label="Policy" value={health.policy_visibility_pct} />
        <CoverageBar label="Competitive" value={health.competitive_visibility_pct} />
      </div>

      {/* Confidence */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 6 }}>
        <span style={{ fontSize: 24, fontWeight: 700, color: "white" }}>{health.overall_confidence}%</span>
        <span
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.5)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          confidence
        </span>
      </div>
    </div>
  );
}
