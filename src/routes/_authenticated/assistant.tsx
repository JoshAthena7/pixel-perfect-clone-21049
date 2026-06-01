import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/assistant")({
  component: () => <Navigate to="/command" search={{ tab: "briefing" }} replace />,
});
