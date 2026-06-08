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
  beforeLoad: async ({ location }) => {
    const sessionResult = await withTimeout(
      supabase.auth.getSession(),
      2500,
      { data: { session: null }, error: null },
    );
    const user = sessionResult.data.session?.user ?? null;
    if (sessionResult.error || !user) {
      throw redirect({ to: "/login" });
    }
    // Three-state gate: anyone not ACTIVE (onboarded) and not a platform admin
    // is sent to /welcome to finish onboarding. Platform admins bypass so they
    // can never lock themselves out of Olympus.
    const { data: prof } = await withTimeout(
      supabase
        .from("profiles")
        .select("has_onboarded,is_platform_admin")
        .eq("id", user.id)
        .maybeSingle(),
      4000,
      { data: null, error: null, count: null, status: 200, statusText: "OK" },
    );
    const isAdmin = prof?.is_platform_admin === true;
    const onboarded = prof?.has_onboarded === true;
    const path = location.pathname;
    const onWelcome = path === "/welcome" || path.startsWith("/welcome/");
    if (!onboarded && !isAdmin && !onWelcome) {
      throw redirect({ to: "/welcome" });
    }
    return { user };
  },
  component: AuthenticatedLayout,
});

function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Paths a non-admin is allowed to view outside the V1 shell.
const NON_ADMIN_ALLOWED_PREFIXES = [
  "/flight-deck",
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

  // Non-admins land on the new Flight Deck instead of the legacy V1 shell.
  if (!isAllowedForNonAdmin(path)) {
    return <Navigate to="/flight-deck" replace />;
  }

  return (
    <V1Shell>
      <Outlet />
      <ClosingFrame />
      <IdleCurtain />
    </V1Shell>
  );
}
