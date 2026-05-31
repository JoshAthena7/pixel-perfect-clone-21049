import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/team")({
  component: () => <Navigate to="/mission-control" replace />,
});
