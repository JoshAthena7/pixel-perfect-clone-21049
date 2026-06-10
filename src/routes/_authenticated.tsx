import { createFileRoute, Outlet, redirect, useRouterState, Navigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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
      { data: null, error: null, count: null, status: 200, statusText: "OK", success: true },
    );
    const isAdmin = prof?.is_platform_admin === true;
    const onboarded = prof?.has_onboarded === true;
    const path = location.pathname;
    const onWelcome = path === "/welcome" || path.startsWith("/welcome/");
    if (!onboarded && !isAdmin && !onWelcome) {
      throw redirect({ to: "/welcome" });
    }

    // ATLAS onboarding gate. Every consultant must finish the 5-step Atlas
    // onboarding flow before they can access any part of ATLAS. Platform
    // admins are exempt (so they can never lock themselves out). The check
    // runs server-side on every navigation — no cookie / device escape.
    if (!isAdmin && user.email) {
      const { data: member } = await withTimeout(
        supabase
          .from("atlas_team_members")
          .select("atlas_onboarding_complete,is_removed")
          .ilike("email", user.email)
          .maybeSingle(),
        4000,
        { data: null, error: null, count: null, status: 200, statusText: "OK", success: true },
      );
      const needsAtlasOnboarding =
        member && !member.is_removed && member.atlas_onboarding_complete !== true;
      if (needsAtlasOnboarding) {
        throw redirect({ to: "/atlas-onboarding" });
      }
    }
    return { user, isAdmin };

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

  // /admin owns its own layout — bypass the outer Atrium chrome entirely.
  // Runs before any role gate so admin.tsx renders immediately without flicker.
  if (path === "/admin" || path.startsWith("/admin/")) {
    return <Outlet />;
  }

  const { isAdmin } = Route.useRouteContext();

  const shell = (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/60 px-6 py-3">
        <nav className="mx-auto flex max-w-7xl items-center gap-4 text-sm">
          <Link to="/home" className="font-semibold tracking-[0.18em] text-foreground">ATLAS</Link>
          <Link to="/missions" className="text-muted-foreground hover:text-foreground">Missions</Link>
          {isAdmin && <Link to="/admin" className="text-muted-foreground hover:text-foreground">Admin</Link>}
          <Link to="/profile" className="ml-auto text-muted-foreground hover:text-foreground">Profile</Link>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );

  if (isAdmin) return shell;

  // Non-admins land on the new Flight Deck instead of the legacy V1 shell.
  if (!isAllowedForNonAdmin(path)) {
    return <Navigate to="/missions" replace />;
  }

  return shell;
}
