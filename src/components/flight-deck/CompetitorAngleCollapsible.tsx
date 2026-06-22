/**
 * Competitor Angle Collapsible — appears below the cockpit signal surface.
 * Reads known_competitors from mission_iris_config and generates a one-line
 * angle per competitor for the active question. Collapsed by default; the
 * AI fetch only fires when the user opens it.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Crosshair } from "lucide-react";
import { getQuestionCompetitorAngle } from "@/lib/cockpit-intel.functions";

const GOLD = "#C9972B";

export function CompetitorAngleCollapsible({
  missionId,
  questionId,
}: {
  missionId: string;
  questionId: string;
}) {
  const [open, setOpen] = useState(false);
  const fetchFn = useServerFn(getQuestionCompetitorAngle);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["cockpit-competitor-angle", missionId, questionId],
    queryFn: () => fetchFn({ data: { missionId, questionId } }),
    enabled: open,
    staleTime: 10 * 60_000,
  });

  const competitors = data?.competitors ?? [];

  return (
    <div
      style={{
        marginBottom: 12,
        borderRadius: 8,
        background: "rgba(239,68,68,0.04)",
        border: "1px solid rgba(239,68,68,0.18)",
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          all: "unset",
          cursor: "pointer",
          width: "100%",
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Crosshair size={11} style={{ color: "#f87171" }} />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: "#f87171",
            textTransform: "uppercase",
          }}
        >
          Show Competitor Angle
        </span>
        {open && competitors.length > 0 && (
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
            · {competitors.length} competitor{competitors.length === 1 ? "" : "s"}
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {isLoading || isFetching ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>
              IRIS is reading the field…
            </div>
          ) : competitors.length === 0 ? (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>
              No known competitors configured. Add them in IRIS Control → mission config.
            </div>
          ) : (
            competitors.map((c) => (
              <div
                key={c.name}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: GOLD, marginBottom: 3 }}>
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: c.ok ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.45)",
                    fontStyle: c.ok ? "normal" : "italic",
                    lineHeight: 1.45,
                  }}
                >
                  {c.angle}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
