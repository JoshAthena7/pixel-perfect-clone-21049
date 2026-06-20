import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { seedMissionIntelligence } from "@/lib/iris-seed-mission-intelligence.functions";
import { OracleIntakeModal } from "@/components/oracle/OracleIntakeModal";
import { GOLD, SECTIONS, coverageSentence, coveragePercent } from "./coverage";
import { scrollToSection, type } from "./JumpNav";
import { type SectionId } from "./coverage";

export function IntelSidebar({
  missionId,
  approvedCount,
  activeSection,
}: {
  missionId: string;
  approvedCount: number;
  activeSection: SectionId;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const qc = useQueryClient();
  const seedFn = useServerFn(seedMissionIntelligence);

  const pct = coveragePercent(approvedCount);

  const refresh = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      await seedFn({ data: { missionId, force: true } });
      toast.success("IRIS refresh complete");
      qc.invalidateQueries({ queryKey: ["intel-counts", missionId] });
      qc.invalidateQueries({ queryKey: ["oracle-signals", missionId] });
      qc.invalidateQueries({ queryKey: ["intel-gaps", missionId] });
    } catch (e) {
      console.log("[intel-sidebar] refresh failed", e);
      toast.error("IRIS refresh failed");
    } finally {
      setSeeding(false);
    }
  };

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

      {/* Quick Actions */}
      <div>
        <SectionLabel>QUICK ACTIONS</SectionLabel>
        <div className="mt-2 space-y-1.5">
          <SidebarButton onClick={() => setAddOpen(true)} icon={<Plus className="h-3 w-3" />}>
            Add Single Item
          </SidebarButton>
          <Link
            to="/missions/$missionId/setup"
            params={{ missionId }}
            style={{ display: "block" }}
          >
            <SidebarButton as="span" icon={<Settings2 className="h-3 w-3" />}>
              Open Setup Wizard
            </SidebarButton>
          </Link>
          <SidebarButton
            onClick={refresh}
            disabled={seeding}
            icon={seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          >
            Refresh IRIS
          </SidebarButton>
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

      <div
        style={{
          fontSize: 9,
          color: "rgba(255,255,255,0.3)",
          paddingTop: 8,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        IRIS config → Olympus
      </div>

      <OracleIntakeModal missionId={missionId} open={addOpen} onOpenChange={setAddOpen} />
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

function SidebarButton({
  children,
  onClick,
  disabled,
  icon,
  as = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  as?: "button" | "span";
}) {
  const style: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "6px 10px",
    fontSize: 11,
    color: GOLD,
    background: "rgba(196,154,43,0.06)",
    border: "0.5px solid rgba(196,154,43,0.25)",
    borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    textAlign: "left",
  };
  if (as === "span") {
    return (
      <span style={style}>
        {icon}
        {children}
      </span>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {icon}
      {children}
    </button>
  );
}
