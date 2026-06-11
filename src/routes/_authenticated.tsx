import { createFileRoute, Outlet, redirect, useRouterState, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { IrisProvider } from "@/components/iris/IrisContext";
import { IrisDock } from "@/components/iris/IrisDock";
import { AssistsBar } from "@/components/iris/AssistsBar";
import { AdminQuickBar } from "@/components/admin/AdminQuickBar";
import { GlobalCommandBar } from "@/components/nav/GlobalCommandBar";
import { getMyHome } from "@/lib/v2-home.functions";


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
    const [{ data: prof }, { data: roleRow }] = await Promise.all([
      withTimeout(
        supabase
          .from("profiles")
          .select("has_onboarded,is_platform_admin")
          .eq("id", user.id)
          .maybeSingle(),
        4000,
        { data: null, error: null, count: null, status: 200, statusText: "OK", success: true },
      ),
      withTimeout(
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle(),
        4000,
        { data: null, error: null, count: null, status: 200, statusText: "OK", success: true },
      ),
    ]);
    const isAdmin = prof?.is_platform_admin === true || !!roleRow;
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
  "/my-work",
  "/portfolio",
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
  const navigate = useNavigate();

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const [irisPrefill, setIrisPrefill] = useState<{ value: string; nonce: number } | null>(null);
  const [irisOpenSignal, setIrisOpenSignal] = useState(0);

  // Bridge window events from My Work / Portfolio buttons into IRIS Dock signals.
  useEffect(() => {
    const onOpen = () => setIrisOpenSignal(Date.now());
    const onPrefill = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (typeof ce.detail === "string") {
        setIrisPrefill({ value: ce.detail, nonce: Date.now() });
      }
    };
    window.addEventListener("atlas:iris:open", onOpen);
    window.addEventListener("atlas:iris:prefill", onPrefill as EventListener);
    return () => {
      window.removeEventListener("atlas:iris:open", onOpen);
      window.removeEventListener("atlas:iris:prefill", onPrefill as EventListener);
    };
  }, []);

  // Role-based home: resolve once per session, redirect on canonical landing paths.
  const homeFn = useServerFn(getMyHome);
  const { data: homeInfo } = useQuery({
    queryKey: ["my-home"],
    queryFn: () => homeFn(),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!homeInfo) return;
    try {
      localStorage.setItem("atlas_role_home", homeInfo.home);
    } catch { /* ignore */ }
    const landingPaths = new Set(["/", "/home", "/atrium", "/olympus", "/v1", "/flight-deck"]);
    if (landingPaths.has(path)) {
      const target =
        homeInfo.home === "my-work"
          ? "/my-work"
          : homeInfo.home === "portfolio"
            ? "/portfolio"
            : "/olympus/missions";
      navigate({ to: target as never, replace: true });
      return;
    }
    // Cross-role guard: /portfolio is executive-only.
    if (path.startsWith("/portfolio") && homeInfo.home !== "portfolio" && !isAdmin) {
      toast.info("That page is for executives.");
      navigate({ to: "/my-work", replace: true });
      return;
    }
    if (path.startsWith("/my-work") && homeInfo.home === "portfolio") {
      toast.info("Writers use that page.");
      navigate({ to: "/portfolio", replace: true });
    }
  }, [homeInfo, path, navigate, isAdmin]);

  const hideFloatingAssists =
    path === "/olympus/flight-deck" || path === "/my-work" || path === "/portfolio";

  const isOlympusAdminContext = isAdmin && (path.startsWith("/olympus") || path.startsWith("/admin") || path === "/reports" || path === "/home");

  const shell = (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalCommandBar email={email} isAdmin={isAdmin} />
      <main>
        <Outlet />
      </main>
      <div className={hideFloatingAssists ? "md:hidden" : ""}>
        {isOlympusAdminContext ? (
          <AdminQuickBar
            onPrefillIris={(value) => setIrisPrefill({ value, nonce: Date.now() })}
            onOpenIris={() => setIrisOpenSignal(Date.now())}
          />
        ) : (
          <AssistsBar
            onPrefillIris={(value) => setIrisPrefill({ value, nonce: Date.now() })}
            onOpenIris={() => setIrisOpenSignal(Date.now())}
          />
        )}
      </div>
      <IrisDock prefillSignal={irisPrefill} openSignal={irisOpenSignal} />
    </div>
  );

  if (isAdmin) return <IrisProvider>{shell}</IrisProvider>;

  if (!isAllowedForNonAdmin(path)) {
    return <Navigate to="/olympus/missions" replace />;
  }

  return <IrisProvider>{shell}</IrisProvider>;
}

