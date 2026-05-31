/**
 * MISSION ADMINISTRATION — /mission-admin (platform admin redirect)
 * Platform admins access mission administration via /mission-control
 */
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useIsAdmin } from "@/hooks/use-admin";

export const Route = createFileRoute("/_authenticated/mission-admin")({
  head: () => ({ meta: [{ title: "Mission Administration — Athena Command" }] }),
  component: MissionAdminGate,
});

function MissionAdminGate() {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/command" replace />;
  return <Navigate to="/mission-control" replace />;
}
