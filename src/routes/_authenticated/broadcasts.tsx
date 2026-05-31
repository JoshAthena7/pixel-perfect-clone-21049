import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/broadcasts")({
  component: () => <Navigate to="/command" search={ tab: "overview" } replace />,
});
