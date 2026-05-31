import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/question-health")({
  component: () => <Navigate to="/command" search={ tab: "assignments" } replace />,
});
