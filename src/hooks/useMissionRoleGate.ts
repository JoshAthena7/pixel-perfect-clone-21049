/**
 * Centralized role-gate hook for mission sub-routes.
 *
 * - "manager" tabs (Team, Journey, Q&A, Win Strategy): visible to
 *   admins and to mission Engagement Leads / Project Managers / Leads.
 * - "admin" tabs (Settings, Activity audit log, Reports, Compliance):
 *   visible only to platform admins (user_roles.role = 'admin').
 *
 * When the current viewer is not allowed, the hook redirects to
 * `/missions/$missionId/briefing` instead of rendering anything.
 */
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMissionAccess, useIsAdmin } from "./useAccess";

const MANAGER_ROLES = new Set(["engagement_lead", "project_manager", "lead", "lead_writer"]);

export type MissionGate = "manager" | "admin";

export function useMissionRoleGate(missionId: string, gate: MissionGate) {
  const navigate = useNavigate();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: access, isLoading: accessLoading, isFetching: accessFetching } = useMissionAccess(missionId);

  const role = (access?.role ?? "").toLowerCase();
  const isManager = isAdmin || MANAGER_ROLES.has(role);
  const allowed = gate === "admin" ? isAdmin : isManager;
  // Treat "data not yet returned" and "background refetch in flight" as
  // resolving. Without `isFetching` + `access === undefined` guards, a
  // 60-second token refresh that re-runs the access query can briefly look
  // like "not allowed" and redirect the user mid-session.
  const resolving =
    adminLoading || accessLoading || accessFetching || access === undefined;

  useEffect(() => {
    if (resolving) return;
    if (allowed) return;
    void navigate({
      to: "/missions/$missionId/briefing",
      params: { missionId },
      replace: true,
    });
  }, [allowed, resolving, missionId, navigate]);

  return { allowed, resolving, isAdmin, isManager };
}
