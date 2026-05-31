import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/insights")({
  component: () => <Navigate to="/intel" replace />,
});
