// overview.tsx — redirects to Command Center (Morning Brief)
// This route is deprecated. The overview is now /select-engagement.
import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/overview")({
  component: () => <Navigate to="/select-engagement" replace />,
});
