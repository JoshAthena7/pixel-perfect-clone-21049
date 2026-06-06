import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/v2/AppShell";
import { ClosingFrame } from "@/components/v2/ClosingFrame";
import { IdleCurtain } from "@/components/v2/IdleCurtain";
import { FirstLight } from "@/components/v2/FirstLight";
import { DailyBell } from "@/components/v2/DailyBell";
import { LoginRouter } from "@/components/v2/LoginRouter";
import { OrientationTooltip } from "@/components/v2/OrientationTooltip";

export const Route = createFileRoute("/_authenticated")({
  // Client-only gate. Supabase stores the session in localStorage, which the
  // server cannot read — gating on SSR would cause hard-refresh redirect loops
  // and a flash of /login for authenticated users.
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

function AuthenticatedLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Phase 3 — checkin_only users get a minimalist landing with no app shell.
  // The full nav / mission cards / IRIS dock are intentionally hidden.
  if (path === "/checkin-home" || path.startsWith("/checkin-home/")) {
    return (
      <>
        <Outlet />
        <ClosingFrame />
      </>
    );
  }
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

