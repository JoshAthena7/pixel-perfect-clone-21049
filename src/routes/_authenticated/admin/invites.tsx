import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/invites")({
  component: () => <Navigate to="/admin/users" replace />,
});
