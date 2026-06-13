export function HealthBadge({ health, size = "lg" }: { health: "green" | "amber" | "red"; size?: "lg" | "sm" }) {
  const map = {
    green: { label: "● HEALTHY", bg: "rgba(26,122,74,0.15)", border: "rgba(26,122,74,0.4)", color: "#7DCF7D" },
    amber: { label: "⚡ AMBER", bg: "rgba(239,159,39,0.15)", border: "rgba(239,159,39,0.4)", color: "#EF9F27" },
    red: { label: "🔴 AT RISK", bg: "rgba(224,74,74,0.15)", border: "rgba(224,74,74,0.4)", color: "#f08080" },
  } as const;
  const s = map[health];
  return (
    <span
      className="inline-flex items-center rounded-full font-medium"
      style={{
        background: s.bg,
        border: `0.5px solid ${s.border}`,
        color: s.color,
        fontSize: size === "lg" ? 12 : 10,
        padding: size === "lg" ? "5px 12px" : "2px 8px",
        letterSpacing: "0.05em",
      }}
    >
      {s.label}
    </span>
  );
}

import { Link } from "@tanstack/react-router";
import { Wand2, Pencil, Flag } from "lucide-react";
import { useState } from "react";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { CloseMissionDialog } from "@/components/mission-command/CloseMissionDialog";

export function BriefingHeader({
  missionName,
  clientName,
  health,
  missionId,
  isAdmin = false,
}: {
  missionName: string;
  clientName: string | null;
  health: "green" | "amber" | "red";
  missionId?: string;
  isAdmin?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  return (
    <header className="mb-6">
      {isAdmin && missionId && (
        <>
          <MissionEditPanel missionId={missionId} open={editOpen} onOpenChange={setEditOpen} />
          <CloseMissionDialog missionId={missionId} open={closeOpen} onOpenChange={setCloseOpen} />
        </>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 style={{ color: "white", fontSize: 18, fontWeight: 500 }} className="truncate">
            {missionName}
          </h1>
          {clientName && (
            <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>
              {clientName}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && missionId && (
            <>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-surface/60 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-surface transition-colors"
              >
                <Pencil className="h-3 w-3" /> Edit Mission
              </button>
              <Link
                to="/olympus/missions/$missionId/wizard"
                params={{ missionId }}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--athena-gold)]/40 bg-[var(--athena-gold)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--athena-gold)] hover:bg-[var(--athena-gold)]/20 transition-colors"
              >
                <Wand2 className="h-3 w-3" /> Enhance in Olympus
              </Link>
            </>
          )}
          <HealthBadge health={health} />
        </div>
      </div>
      <div
        className="mt-2"
        style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontStyle: "italic" }}
      >
        This room is maintained by Olympus. Read only.
      </div>
    </header>
  );
}

