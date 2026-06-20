import { GOLD } from "./coverage";

const URGENCY_COLOR: Record<string, string> = {
  immediate: "#ef4444",
  high: "#C49A2B",
  normal: "#3b82f6",
  low: "#64748b",
};

const CATEGORY_LABEL: Record<string, string> = {
  regulatory_state: "Regulatory · State",
  regulatory_federal: "Regulatory · Federal",
  evidence_base: "Evidence Base",
  field_intelligence: "Field Intelligence",
  policy_innovation: "Policy Innovation",
  competitive_landscape: "Competitive",
  quality_performance: "Quality",
  health_outcomes_sdoh: "SDOH",
  client_content_map: "Client Content",
  stakeholder_communication: "Stakeholder",
};

export function ElevatedSignalCard({ signal }: { signal: any }) {
  const urgency = signal.urgency ?? "normal";
  const accent = URGENCY_COLOR[urgency] ?? URGENCY_COLOR.normal;
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div className="flex flex-wrap items-center gap-2 mb-2" style={{ fontSize: 9 }}>
        <Pill color={accent}>{urgency.toUpperCase()}</Pill>
        {signal.category && (
          <Pill color="rgba(255,255,255,0.4)">{CATEGORY_LABEL[signal.category] ?? signal.category}</Pill>
        )}
        <Pill color={GOLD}>{signal.relevance_score ?? 0}/100</Pill>
        <span style={{ color: "rgba(255,255,255,0.35)" }}>{signal.source_name ?? "—"}</span>
        <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>
          {formatDate(signal.created_at)}
        </span>
        <span
          title="Verified ORACLE intelligence"
          style={{
            fontSize: 8,
            padding: "1px 5px",
            borderRadius: 3,
            background: "rgba(196,154,43,0.15)",
            color: GOLD,
            border: "0.5px solid rgba(196,154,43,0.4)",
            fontWeight: 700,
          }}
        >
          ORACLE
        </span>
      </div>

      <div style={{ color: "white", fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
        {signal.title}
      </div>

      {signal.what_happened && (
        <div style={{ color: "white", fontSize: 12, marginTop: 8, lineHeight: 1.5, opacity: 0.85 }}>
          {signal.what_happened}
        </div>
      )}

      {signal.why_it_matters && (
        <div
          style={{
            fontSize: 11,
            fontStyle: "italic",
            color: GOLD,
            marginTop: 10,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 700, marginRight: 6 }}>WHY IT MATTERS:</span>
          {signal.why_it_matters}
        </div>
      )}

      {signal.recommended_action && (
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.55)",
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 600, marginRight: 6, color: "rgba(255,255,255,0.7)" }}>
            RECOMMENDED:
          </span>
          {signal.recommended_action}
        </div>
      )}
    </div>
  );
}

export function CompactSignalCard({ signal, primary }: { signal: any; primary?: boolean }) {
  return (
    <div
      style={{
        background: "rgba(5,13,24,0.5)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: 12,
        marginBottom: 8,
      }}
    >
      <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 9 }}>
        {primary && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: GOLD,
              padding: "1px 5px",
              borderRadius: 3,
              border: "0.5px solid rgba(196,154,43,0.4)",
              background: "rgba(196,154,43,0.08)",
            }}
          >
            PRIMARY
          </span>
        )}
        {signal.category && (
          <Pill color="rgba(255,255,255,0.4)">{CATEGORY_LABEL[signal.category] ?? signal.category}</Pill>
        )}
        <span style={{ color: "rgba(255,255,255,0.45)" }}>{signal.source_name ?? "—"}</span>
        <Pill color={GOLD}>{signal.relevance_score ?? 0}</Pill>
        <span style={{ color: "rgba(255,255,255,0.25)", marginLeft: "auto" }}>
          {formatDate(signal.created_at)}
        </span>
      </div>
      <div style={{ color: "white", fontSize: 12, fontWeight: 500, marginTop: 6 }}>
        {signal.title}
      </div>
      {signal.why_it_matters && (
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 4, lineHeight: 1.45 }}>
          {signal.why_it_matters}
        </div>
      )}
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: 3,
        color,
        background: `${color}15`,
        border: `0.5px solid ${color}40`,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
