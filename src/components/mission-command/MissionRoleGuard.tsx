/**
 * Wrap a mission-scoped page subtree. Hides children (and renders a
 * loader) while role data is resolving. Redirects to the briefing page
 * when the current viewer doesn't have the required role.
 */
import type { ReactNode } from "react";
import { useMissionRoleGate, type MissionGate } from "@/hooks/useMissionRoleGate";

export function MissionRoleGuard({
  missionId,
  gate,
  children,
}: {
  missionId: string;
  gate: MissionGate;
  children: ReactNode;
}) {
  const { allowed, resolving } = useMissionRoleGate(missionId, gate);
  if (resolving) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
        <div
          className="h-32 rounded-xl border border-border animate-pulse"
          style={{ background: "rgba(255,255,255,0.04)" }}
        />
      </div>
    );
  }
  if (!allowed) return null;
  return <>{children}</>;
}
