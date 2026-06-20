import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GOLD, SECTIONS, coverageSentence, coveragePercent, type SectionId } from "./coverage";
import { scrollToSection } from "./JumpNav";

export function IntelSidebar({
  missionId,
  approvedCount,
  activeSection,
}: {
  missionId: string;
  approvedCount: number;
  activeSection: SectionId;
}) {
  const pct = coveragePercent(approvedCount);

  return (
    <aside
      className="space-y-5"
      style={{
        position: "sticky",
        top: 80,
        alignSelf: "start",
        fontSize: 12,
      }}
    >
      {/* Oracle Health */}
      <div>
        <SectionLabel>ORACLE HEALTH</SectionLabel>
        <div className="mt-2 flex items-baseline gap-2">
          <span style={{ fontSize: 22, fontWeight: 700, color: GOLD }}>{pct}%</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>
            coverage
          </span>
        </div>
        <div
          className="relative mt-1"
          style={{
            width: "100%",
            height: 3,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 2,
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: GOLD,
              borderRadius: 2,
            }}
          />
        </div>
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.5)",
            marginTop: 8,
            lineHeight: 1.45,
          }}
        >
          {coverageSentence(approvedCount)}
        </div>
      </div>

      {/* Section Navigation */}
      <div>
        <SectionLabel>SECTIONS</SectionLabel>
        <div className="mt-2 flex flex-col gap-0.5">
          {SECTIONS.map((s) => {
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollToSection(s.id)}
                style={{
                  textAlign: "left",
                  padding: "4px 8px",
                  fontSize: 11,
                  color: active ? GOLD : "rgba(255,255,255,0.55)",
                  background: active ? "rgba(196,154,43,0.08)" : "transparent",
                  border: "none",
                  borderLeft: `2px solid ${active ? GOLD : "transparent"}`,
                  cursor: "pointer",
                  borderRadius: 0,
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Manage intelligence link — the single canonical entry into ORACLE
          for ongoing intel work. The Intelligence page is read-only. */}
      <Link
        to="/missions/$missionId/olympus"
        params={{ missionId }}
        className="inline-flex items-center gap-1 hover:underline"
        style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}
      >
        Manage intelligence <ArrowRight className="h-3 w-3" />
      </Link>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "rgba(255,255,255,0.4)",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
