import { createFileRoute, Outlet, redirect, useRouterState, Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/v2/AppShell";
import { V1Shell } from "@/components/v1/V1Shell";
import { ClosingFrame } from "@/components/v2/ClosingFrame";
import { IdleCurtain } from "@/components/v2/IdleCurtain";
import { FirstLight } from "@/components/v2/FirstLight";
import { DailyBell } from "@/components/v2/DailyBell";
import { LoginRouter } from "@/components/v2/LoginRouter";
import { OrientationTooltip } from "@/components/v2/OrientationTooltip";
import { useIsAdmin } from "@/hooks/useAccess";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

// Paths a non-admin is allowed to view outside the V1 shell.
const NON_ADMIN_ALLOWED_PREFIXES = [
  "/v1",
  "/profile",
  "/checkin-home",
  "/checkin",
  "/missions", // mission deep links still resolve (legacy)
];

function isAllowedForNonAdmin(path: string): boolean {
  return NON_ADMIN_ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"),
  );
}

function AuthenticatedLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  // Check-in only users get a minimalist landing.
  if (path === "/checkin-home" || path.startsWith("/checkin-home/")) {
    return (
      <>
        <Outlet />
        <ClosingFrame />
      </>
    );
  }

  // While we resolve role, render nothing visible — avoids briefly mounting
  // the Atrium chrome for non-admins.
  if (adminLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  // Admins keep the full Atrium chrome (Athena HQ, top nav, etc.).
  if (isAdmin) {
    return (
      <AppShell>
        <LoginRouter />
        <Outlet />
        <ClosingFrame />
        <IdleCurtain />
        <FirstLight />
        <DailyBell />
        <OrientationTooltip />
      </AppShell>
    );
  }

  // Non-admins live entirely inside the V1 mission shell.
  // Anything outside the allow-list redirects to /v1.
  if (!isAllowedForNonAdmin(path)) {
    return <Navigate to="/v1" replace />;
  }

  return (
    <V1Shell>
      <Outlet />
      <ClosingFrame />
      <IdleCurtain />
    </V1Shell>
  );
}
