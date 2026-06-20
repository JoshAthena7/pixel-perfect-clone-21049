import { useMemo } from "react";
import { CompactSignalCard } from "./SignalCard";

const AUTHORITY_ORDER: Record<string, number> = {
  primary: 0,
  secondary: 1,
  tertiary: 2,
};

const EVIDENCE_CATS = new Set([
  "evidence_base",
  "quality_performance",
  "regulatory_federal",
  "regulatory_state",
  "health_outcomes_sdoh",
  "policy_innovation",
]);

export function EvidenceBase({ signals }: { signals: any[] }) {
  const rows = useMemo(
    () =>
      signals
        .filter((s) => EVIDENCE_CATS.has(s.category))
        .filter((s) => ["approved", "pushed", "needs_review"].includes(s.status))
        .sort((a, b) => {
          const aa = AUTHORITY_ORDER[a.authority ?? "tertiary"] ?? 2;
          const bb = AUTHORITY_ORDER[b.authority ?? "tertiary"] ?? 2;
          if (aa !== bb) return aa - bb;
          return (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
        }),
    [signals]
  );

  return (
    <section id="section-evidence" style={{ marginBottom: 32 }}>
      <h2
        style={{
          color: "white",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          marginBottom: 2,
        }}
      >
        EVIDENCE BASE
      </h2>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
        Research, regulatory authority, and supporting data
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
          No evidence items yet.
        </div>
      ) : (
        rows.map((s) => (
          <CompactSignalCard key={s.id} signal={s} primary={s.authority === "primary"} />
        ))
      )}
    </section>
  );
}
