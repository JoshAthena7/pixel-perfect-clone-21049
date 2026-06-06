import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/v2/AppShell";
import { ClosingFrame } from "@/components/v2/ClosingFrame";
import { IdleCurtain } from "@/components/v2/IdleCurtain";
import { FirstLight } from "@/components/v2/FirstLight";

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
  return (
    <AppShell>
      <Outlet />
      <ClosingFrame />
      <IdleCurtain />
      <FirstLight />
    </AppShell>
  );
}
