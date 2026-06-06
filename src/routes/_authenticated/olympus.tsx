import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { useIsAdmin } from "@/hooks/useAccess";
import { NotAvailable } from "@/components/access/NotAvailable";
import { StrategicOlympus } from "@/components/v2/StrategicOlympus";

// Phase 5 — Olympus is the executive intelligence view.
// All platform administration moved to /admin. /olympus now renders only
// the StrategicOlympus shell for executives and admins.
export const Route = createFileRoute("/_authenticated/olympus")({
  component: OlympusStrategic,
});

function OlympusStrategic() {
  const { isAdmin, isLoading } = useIsAdmin();

  const { data: execAccess, isLoading: execLoading } = useQuery({
    queryKey: ["olympus-exec-access"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isExec: false, isLead: false };
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("user_id", user.id);
      const roles = new Set((data ?? []).map((r: any) => r.role as string));
      return {
        isExec: roles.has("executive_sponsor"),
        isLead:
          roles.has("admin") ||
          roles.has("lead") ||
          roles.has("engagement_lead") ||
          roles.has("project_manager"),
      };
    },
  });

  if (isLoading || execLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  const canSeeStrategic = isAdmin || !!execAccess?.isExec;
  if (!canSeeStrategic) {
    return <NotAvailable kind="olympus" />;
  }

  return (
    <StrategicOlympus
      canSubmitDecisions={isAdmin || !!execAccess?.isLead}
      canResolveDecisions={isAdmin || !!execAccess?.isExec}
    />
  );
}
