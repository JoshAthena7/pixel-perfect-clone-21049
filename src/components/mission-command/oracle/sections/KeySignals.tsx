import { useMemo, useState } from "react";
import { GOLD } from "./coverage";
import { ElevatedSignalCard, CompactSignalCard } from "./SignalCard";

type FilterId =
  | "all"
  | "signals"
  | "risks"
  | "research"
  | "competitive"
  | "stakeholder"
  | "lessons"
  | "regulatory";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "signals", label: "Signals" },
  { id: "risks", label: "Risks" },
  { id: "research", label: "Research" },
  { id: "competitive", label: "Competitive" },
  { id: "stakeholder", label: "Stakeholder" },
  { id: "lessons", label: "Lessons" },
  { id: "regulatory", label: "Regulatory" },
];

const URGENCY_ORDER: Record<string, number> = {
  immediate: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function matchFilter(filter: FilterId, s: any): boolean {
  const cat = s.category as string | null;
  const u = s.urgency as string | null;
  const tags = (s.topic_tags ?? []) as string[];
  const ing = s.ingestion_source as string | null;
  switch (filter) {
    case "all":
      return true;
    case "signals":
      return cat === "field_intelligence" || cat === "policy_innovation";
    case "risks":
      return u === "immediate" || u === "high" || cat === "competitive_landscape";
    case "research":
      return cat === "evidence_base";
    case "competitive":
      return cat === "competitive_landscape";
    case "stakeholder":
      return tags.includes("stakeholder") || cat === "stakeholder_communication";
    case "regulatory":
      return cat === "regulatory_federal" || cat === "regulatory_state";
    case "lessons":
      return ing === "rfp_extraction" || ing === "document_processing";
    default:
      return false;
  }
}

export function isLegacyScan(s: any): boolean {
  return (
    s.ingestion_source === "automated_feed" &&
    typeof s.title === "string" &&
    s.title.toLowerCase().startsWith("initial scan:")
  );
}

export function KeySignals({ signals }: { signals: any[] }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [showMore, setShowMore] = useState(false);

  const eligible = useMemo(() => {
    return signals
      .filter((s) => ["approved", "pushed", "needs_review"].includes(s.status))
      .filter((s) => !isLegacyScan(s))
      .filter((s) => matchFilter(filter, s))
      .sort((a, b) => {
        const ua = URGENCY_ORDER[a.urgency ?? "normal"] ?? 2;
        const ub = URGENCY_ORDER[b.urgency ?? "normal"] ?? 2;
        if (ua !== ub) return ua - ub;
        return (b.relevance_score ?? 0) - (a.relevance_score ?? 0);
      });
  }, [signals, filter]);

  const top3 = eligible.slice(0, 3);
  const rest = eligible.slice(3);

  return (
    <section id="section-signals" style={{ marginBottom: 32 }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 style={{ color: "white", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em" }}>
          KEY SIGNALS
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "3px 10px",
                  fontSize: 10,
                  borderRadius: 999,
                  color: active ? GOLD : "rgba(255,255,255,0.45)",
                  background: active ? "rgba(196,154,43,0.12)" : "transparent",
                  border: `0.5px solid ${active ? "rgba(196,154,43,0.45)" : "rgba(255,255,255,0.08)"}`,
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {top3.length === 0 ? (
        <div
          className="text-center py-8"
          style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}
        >
          No signals match this filter.
        </div>
      ) : (
        top3.map((s) => <ElevatedSignalCard key={s.id} signal={s} />)
      )}

      {rest.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            style={{
              fontSize: 11,
              color: GOLD,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "6px 0",
            }}
          >
            {showMore ? "Hide" : `Show ${rest.length} more signal${rest.length === 1 ? "" : "s"}`} {showMore ? "↑" : "↓"}
          </button>
          {showMore && (
            <div className="mt-2">
              {rest.map((s) => (
                <CompactSignalCard key={s.id} signal={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
