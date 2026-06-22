/**
 * Cockpit Signal Surface — auto-fetches top 3 ORACLE signals the moment a
 * question expands in the cockpit. No click required. Compact display so
 * it doesn't dominate the brief.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio, ExternalLink } from "lucide-react";
import { getQuestionSignals } from "@/lib/cockpit-intel.functions";

const GOLD = "#C9972B";

export function CockpitSignalSurface({
  missionId,
  questionId,
}: {
  missionId: string;
  questionId: string;
}) {
  const fetchFn = useServerFn(getQuestionSignals);
  const { data, isLoading } = useQuery({
    queryKey: ["cockpit-signals", missionId, questionId],
    queryFn: () => fetchFn({ data: { missionId, questionId } }),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div style={wrapperStyle}>
        <Header source={null} count={0} loading />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
          Reading ORACLE…
        </div>
      </div>
    );
  }

  const signals = data?.signals ?? [];
  if (signals.length === 0) {
    return (
      <div style={wrapperStyle}>
        <Header source={null} count={0} />
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontStyle: "italic" }}>
          No approved ORACLE signals on this mission yet.
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <Header source={data?.source ?? null} count={signals.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {signals.map((s) => (
          <div
            key={s.id}
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>
                {s.title}
              </span>
              {s.oracle_score != null && (
                <span style={{ fontSize: 10, color: GOLD, fontFamily: "monospace" }}>
                  {Math.round(s.oracle_score)}
                </span>
              )}
              {s.signal_type && (
                <span
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.45)",
                    textTransform: "uppercase",
                  }}
                >
                  {s.signal_type.replace(/_/g, " ")}
                </span>
              )}
            </div>
            {(s.why_it_matters || s.summary) && (
              <div
                style={{
                  fontSize: 11.5,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 4,
                  lineHeight: 1.45,
                }}
              >
                {s.why_it_matters ?? s.summary}
              </div>
            )}
            {(s.source_name || s.url) && (
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.4)",
                  marginTop: 4,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {s.source_name && <span>{s.source_name}</span>}
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "rgba(255,255,255,0.55)", display: "inline-flex", alignItems: "center", gap: 2 }}
                  >
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 8,
  background: "rgba(127,119,221,0.05)",
  border: "1px solid rgba(127,119,221,0.18)",
  marginBottom: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

function Header({
  source,
  count,
  loading,
}: {
  source: "linked" | "mission" | null;
  count: number;
  loading?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Radio size={11} style={{ color: GOLD }} />
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.14em",
          color: GOLD,
          textTransform: "uppercase",
        }}
      >
        ORACLE Signals
      </span>
      {!loading && source && count > 0 && (
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
          · {source === "linked" ? "linked to this question" : "top mission signals"}
        </span>
      )}
    </div>
  );
}
