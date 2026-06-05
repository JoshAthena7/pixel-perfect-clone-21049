import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/v2/AppShell";

export const Route = createFileRoute("/_authenticated")({
  // Client-only gate. Supabase stores the session in localStorage, which the
  // server cannot read — gating on SSR would cause hard-refresh redirect loops
  // and a flash of /login for authenticated users.
  ssr: false,
  beforeLoad: async () => {
    // Demo mode bypass — allows navigating all screens without auth for Storylane recording.
    if (typeof window !== "undefined" && window.localStorage.getItem("demo_mode") === "1") {
      return { user: { id: "demo-user", email: "demo@atlas.local" } as any };
    }
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
    </AppShell>
  );
}
