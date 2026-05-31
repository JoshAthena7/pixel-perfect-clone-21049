import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/market")({
  component: () => <Navigate to="/intel" replace />,
});
