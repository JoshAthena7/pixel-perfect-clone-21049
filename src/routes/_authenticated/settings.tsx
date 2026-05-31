import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  component: () => <Navigate to="/mission-control" replace />,
});
