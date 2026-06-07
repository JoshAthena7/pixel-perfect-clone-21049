import { createFileRoute } from "@tanstack/react-router";

import { useIsAdmin } from "@/hooks/useAccess";
import { useRedirectIfBlocked } from "@/hooks/useRedirectIfBlocked";
import { StrategicOlympus } from "@/components/v2/StrategicOlympus";

// Olympus is LOCKED to platform admins ONLY.
// No executive_sponsor, lead, PM, writer, SME, or reviewer ever sees this view —
// they are redirected to their mission Flight Deck by useRedirectIfBlocked.
export const Route = createFileRoute("/_authenticated/olympus")({
  component: OlympusStrategic,
});

function OlympusStrategic() {
  const { isAdmin, isLoading } = useIsAdmin();

  const gate = isLoading ? undefined : isAdmin;
  useRedirectIfBlocked(gate);

  if (isLoading || gate === false) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
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
