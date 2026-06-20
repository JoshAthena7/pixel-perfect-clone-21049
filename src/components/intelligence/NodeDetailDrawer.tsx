function timeAgo(ts: string | null): string {
  if (!ts) return "unknown";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

const STATUS_COLOR: Record<string, string> = {
  green: "#4caf7d",
  yellow: "#f0c040",
  red: "#e05252",
  gray: "rgba(255,255,255,0.3)",
};

const STATUS_LABEL: Record<string, string> = {
  green: "Active",
  yellow: "Monitoring",
  red: "Coverage Gap",
  gray: "Inactive",
};

export function NodeDetailDrawer({ node, onClose }: { node: any | null; onClose: () => void }) {
  if (!node) return null;

  const color = STATUS_COLOR[node.status] ?? STATUS_COLOR.gray;
  const statusLabel = STATUS_LABEL[node.status] ?? "Unknown";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 49,
          animation: "modalIn 0.18s ease-out",
        }}
      />

      <aside
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          height: "100vh",
          width: 360,
          background: "#0d1526",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
          zIndex: 50,
          padding: 24,
          overflowY: "auto",
          color: "white",
          boxShadow: "-12px 0 32px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>{node.label}</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", textTransform: "", letterSpacing: "0.06em" }}>
                {statusLabel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.6)",
              fontSize: 22,
              cursor: "pointer",
              lineHeight: 1,
              padding: "0 4px",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700 }}>{node.signal_count}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "", letterSpacing: "0.06em" }}>
              signals detected
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color }}>{node.confidence}%</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "", letterSpacing: "0.06em" }}>
              confidence
            </div>
          </div>
        </div>

        {/* Coverage bar */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "", letterSpacing: "0.06em", marginBottom: 6 }}>
            Coverage
          </div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${node.coverage_pct}%`, height: "100%", background: color, transition: "width 0.6s ease" }} />
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
            {node.coverage_pct}% of this domain monitored
          </div>
        </div>

        {/* Summary */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", textTransform: "", letterSpacing: "0.06em", marginBottom: 8 }}>
            IRIS Intelligence
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.85)", margin: 0 }}>
            {node.summary ?? "IRIS is building intelligence for this domain. Check back soon."}
          </p>
        </div>

        {node.last_activity_at && (
          <div style={{ marginTop: 24, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
            Last activity: {timeAgo(node.last_activity_at)}
          </div>
        )}
      </aside>
    </>
  );
}
