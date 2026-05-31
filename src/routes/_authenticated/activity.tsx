import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/activity")({
  component: () => <Navigate to="/command" search={ tab: "overview" } replace />,
});
