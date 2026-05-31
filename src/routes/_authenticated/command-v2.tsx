import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/command-v2")({
  component: () => <Navigate to="/select-engagement" replace />,
});
