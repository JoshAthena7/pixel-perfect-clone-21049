import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/decisions")({
  component: () => <Navigate to="/pulse" replace />,
});
