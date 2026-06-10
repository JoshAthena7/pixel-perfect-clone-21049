import { createFileRoute, Navigate } from "@tanstack/react-router";

// Catch-all for unknown /olympus/* paths → send users to the mission list,
// not to /home (which is empty and confusing).
export const Route = createFileRoute("/_authenticated/olympus/$")({
  component: () => <Navigate to="/olympus/missions" replace />,
});
