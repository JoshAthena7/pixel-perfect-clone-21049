import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useIsAdmin } from "@/hooks/useAccess";
import { OlympusCommand } from "@/components/olympus/OlympusCommand";

function OlympusIndex() {
  const { isAdmin, isLoading } = useIsAdmin();
  if (isLoading) return null;
  if (!isAdmin) return <Navigate to="/missions" replace />;
  return <OlympusCommand />;
}

export const Route = createFileRoute("/_authenticated/olympus/")({
  component: OlympusIndex,
});
