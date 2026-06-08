import { createFileRoute } from "@tanstack/react-router";
import { useIsAdmin } from "@/hooks/useAccess";
import { StrategicOlympus } from "@/components/v2/StrategicOlympus";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOlympus,
});

function AdminOlympus() {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        One moment…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Admin access required.
      </div>
    );
  }

  return (
    <StrategicOlympus
      canSubmitDecisions={true}
      canResolveDecisions={true}
    />
  );
}
