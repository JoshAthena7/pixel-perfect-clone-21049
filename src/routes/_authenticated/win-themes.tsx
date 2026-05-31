import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/win-themes")({
  component: () => <Navigate to="/command" search={ tab: "decisions" } replace />,
});
