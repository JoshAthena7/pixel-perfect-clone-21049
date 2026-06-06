import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { useIsAdmin } from "@/hooks/useAccess";
import { useRedirectIfBlocked } from "@/hooks/useRedirectIfBlocked";
import { StrategicOlympus } from "@/components/v2/StrategicOlympus";

// Phase 5 — Olympus is the executive intelligence view.
// Admin + executive_sponsor only. Writers/SMEs/reviewers get redirected to
// their mission Flight Deck; they never see the admin control room.
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

  const loading = isLoading || execLoading;
  const canSeeStrategic = loading ? undefined : isAdmin || !!execAccess?.isExec;
  useRedirectIfBlocked(canSeeStrategic);

  if (loading || canSeeStrategic === false) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <StrategicOlympus
      canSubmitDecisions={isAdmin || !!execAccess?.isLead}
      canResolveDecisions={isAdmin || !!execAccess?.isExec}
    />
  );
}
