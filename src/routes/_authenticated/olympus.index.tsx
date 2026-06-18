import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useIsAdmin } from "@/hooks/useAccess";
import { AthenaCommandPage } from "@/components/athena-command/AthenaCommandPage";

function OlympusIndex() {
  const { isAdmin, isLoading } = useIsAdmin();
  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/missions" replace />;
  return <AthenaCommandPage />;
}

export const Route = createFileRoute("/_authenticated/olympus/")({
  component: OlympusIndex,
});
