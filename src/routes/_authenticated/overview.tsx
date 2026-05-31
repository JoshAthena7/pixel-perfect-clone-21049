import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/overview")({
  component: () => <Navigate to="/select-engagement" replace />,
});
