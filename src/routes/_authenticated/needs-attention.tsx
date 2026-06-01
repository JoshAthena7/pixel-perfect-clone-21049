import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/needs-attention")({
  component: () => <Navigate to="/command" search={{ tab: "signals" }} replace />,
});
