import { createFileRoute, Outlet, redirect, useRouterState, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IrisProvider } from "@/components/iris/IrisContext";
import { IrisDock } from "@/components/iris/IrisDock";
import { AssistsBar } from "@/components/iris/AssistsBar";
import { GlobalCommandBar } from "@/components/nav/GlobalCommandBar";
import { OlympusSecondaryNav } from "@/components/nav/OlympusSecondaryNav";
import { Breadcrumbs } from "@/components/nav/Breadcrumbs";

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
  "/olympus", // ATLAS mission system
];

function isAllowedForNonAdmin(path: string): boolean {
  return NON_ADMIN_ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path.startsWith(p + "?"),
  );
}

function AuthenticatedLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Mission setup wizard is a full-page experience — no nav chrome.
  const isWizard =
    path === "/olympus/missions/new" ||
    /^\/olympus\/missions\/[^/]+\/wizard$/.test(path);
  if (isWizard) {
    return <Outlet />;
  }

  const { isAdmin } = Route.useRouteContext();

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const [irisPrefill, setIrisPrefill] = useState<{ value: string; nonce: number } | null>(null);
  const [irisOpenSignal, setIrisOpenSignal] = useState(0);

  const showSecondaryNav =
    path.startsWith("/olympus") &&
    !/^\/olympus\/missions\/[^/]+(\/|$)/.test(path);

  const shell = (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalCommandBar email={email} />
      {showSecondaryNav && <OlympusSecondaryNav />}
      <Breadcrumbs />
      <main>
        <Outlet />
      </main>
      <AssistsBar
        onPrefillIris={(value) => setIrisPrefill({ value, nonce: Date.now() })}
        onOpenIris={() => setIrisOpenSignal(Date.now())}
      />
      <IrisDock prefillSignal={irisPrefill} openSignal={irisOpenSignal} />
    </div>
  );

  if (isAdmin) return <IrisProvider>{shell}</IrisProvider>;

  if (!isAllowedForNonAdmin(path)) {
    return <Navigate to="/olympus/missions" replace />;
  }

  return <IrisProvider>{shell}</IrisProvider>;
}
