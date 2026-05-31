import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/intel")({
  component: () => <Navigate to="/command" search={ tab: "library" } replace />,
});
