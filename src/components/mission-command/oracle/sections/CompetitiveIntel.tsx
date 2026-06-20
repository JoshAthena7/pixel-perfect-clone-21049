import { useMemo } from "react";
import { CompactSignalCard } from "./SignalCard";

export function CompetitiveIntel({ signals }: { signals: any[] }) {
  const rows = useMemo(
    () =>
      signals
        .filter((s) => s.category === "competitive_landscape")
        .filter((s) => ["approved", "pushed", "needs_review"].includes(s.status))
        .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)),
    [signals]
  );

  return (
    <section id="section-competitive" style={{ marginBottom: 32 }}>
      <h2
        style={{
          color: "white",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          marginBottom: 12,
        }}
      >
        COMPETITIVE INTELLIGENCE
      </h2>

      {rows.length === 0 ? (
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            textAlign: "center",
            padding: "16px",
            border: "1px dashed rgba(255,255,255,0.08)",
            borderRadius: 6,
          }}
        >
          No competitive intelligence loaded yet. Add competitor profiles via Add Single Item.
        </div>
      ) : (
        rows.map((s) => <CompactSignalCard key={s.id} signal={s} />)
      )}
    </section>
  );
}
