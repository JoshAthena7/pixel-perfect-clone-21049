import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/huddle")({
  component: () => <Navigate to="/issues" replace />,
});
