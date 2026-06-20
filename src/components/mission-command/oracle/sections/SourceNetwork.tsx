import { useMemo, useState } from "react";
import { IntelSources } from "../IntelSources";
import { CompactSignalCard } from "./SignalCard";
import { isLegacyScan } from "./KeySignals";

export function SourceNetwork({
  missionId,
  signals,
  sourceCount,
  stateLabel,
}: {
  missionId: string;
  signals: any[];
  sourceCount: number;
  stateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const legacy = useMemo(() => signals.filter(isLegacyScan), [signals]);

  return (
    <section id="section-sources" style={{ marginBottom: 32 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "white",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          marginBottom: 8,
        }}
      >
        SOURCE NETWORK {open ? "▼" : "▶"}
      </button>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: open ? 12 : 0 }}>
        {sourceCount} active source{sourceCount === 1 ? "" : "s"} monitoring {stateLabel} and platform intelligence.
      </div>

      {open && (
        <div className="space-y-6 mt-4">
          <IntelSources missionId={missionId} />

          {legacy.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 9,
                  textTransform: "",
                  letterSpacing: "0.1em",
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 8,
                }}
              >
                Legacy feed items ({legacy.length})
              </div>
              {legacy.map((s) => (
                <CompactSignalCard key={s.id} signal={s} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
