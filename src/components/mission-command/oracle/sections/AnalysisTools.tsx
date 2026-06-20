import { useState } from "react";
import { OracleGraph } from "../OracleGraph";
import { StoryMapTab } from "../StoryMapTab";
import { GraphHealthTab } from "../GraphHealthTab";

type SubTab = "graph" | "story-map" | "graph-health";

export function AnalysisTools({
  missionId,
  isAdmin,
  canLead,
  completeness,
}: {
  missionId: string;
  isAdmin: boolean;
  canLead: boolean;
  completeness: number;
}) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<SubTab>("graph");

  const tabs: { id: SubTab; label: string }[] = [
    { id: "graph", label: "Graph" },
    ...(canLead ? ([{ id: "story-map", label: "Story Map" }] as const) : []),
    ...(isAdmin ? ([{ id: "graph-health", label: "Graph Health" }] as const) : []),
  ];

  return (
    <section style={{ marginBottom: 32 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.5)",
          marginBottom: 12,
        }}
      >
        ANALYSIS TOOLS {open ? "▼" : "▶"}
      </button>

      {open && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {tabs.map((t) => {
              const active = sub === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setSub(t.id)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 11,
                    borderRadius: 999,
                    color: active ? "#C49A2B" : "rgba(255,255,255,0.45)",
                    background: active ? "rgba(196,154,43,0.12)" : "transparent",
                    border: `0.5px solid ${active ? "rgba(196,154,43,0.45)" : "rgba(255,255,255,0.08)"}`,
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {sub === "graph" && (
            <OracleGraph missionId={missionId} isAdmin={isAdmin} completeness={completeness} />
          )}
          {sub === "story-map" && canLead && <StoryMapTab missionId={missionId} />}
          {sub === "graph-health" && isAdmin && <GraphHealthTab missionId={missionId} />}
        </>
      )}
    </section>
  );
}
