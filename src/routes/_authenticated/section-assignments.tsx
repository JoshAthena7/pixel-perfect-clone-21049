import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/section-assignments")({
  component: () => <Navigate to="/command" search={ tab: "assignments" } replace />,
});
