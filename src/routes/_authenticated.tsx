import { createFileRoute, Outlet, redirect, useRouterState, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { supabase } from "@/integrations/supabase/client";
import { IrisProvider } from "@/components/iris/IrisContext";
import { AskIrisPanel } from "@/components/iris/AskIrisPanel";

import { GlobalCommandBar } from "@/components/nav/GlobalCommandBar";
import { AppSidebar } from "@/components/nav/AppSidebar";


import { useIsMobile } from "@/hooks/use-mobile";
import { getMyHome } from "@/lib/v2-home.functions";


export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Session lookup reads localStorage — should be instant. If it times out
    // we treat it as a transient glitch and do NOT redirect (otherwise the
    // user gets sporadically kicked back to /login mid-flow).
    const TIMEOUT = Symbol("timeout");
    const sessionResult = await withTimeout(
      supabase.auth.getSession(),
      2500,
      TIMEOUT as never,
    );
    if (sessionResult === (TIMEOUT as never)) {
      // Transient — let the page render; AuthSync will catch real sign-outs.
      return { user: null as never, isAdmin: false };
    }
    const user = sessionResult.data.session?.user ?? null;
    if (sessionResult.error || !user) {
      throw redirect({ to: "/login" });
    }
    // Three-state gate: anyone not ACTIVE (onboarded) and not a platform admin
    // is sent to /welcome to finish onboarding. Platform admins bypass so they
    // can never lock themselves out of Olympus.
    const [profRes, roleRes] = await Promise.all([
      withTimeout(
        supabase
          .from("profiles")
          .select("has_onboarded,is_platform_admin")
          .eq("id", user.id)
          .maybeSingle(),
        4000,
        TIMEOUT as never,
      ),
      withTimeout(
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle(),
        4000,
        TIMEOUT as never,
      ),
    ]);
    // On timeout for either profile/role lookup, fail OPEN: don't redirect to
    // /welcome based on missing data. The next navigation will re-check.
    const profTimedOut = profRes === (TIMEOUT as never);
    const roleTimedOut = roleRes === (TIMEOUT as never);
    const prof = profTimedOut ? null : (profRes as { data: { has_onboarded?: boolean; is_platform_admin?: boolean } | null }).data;
    const roleRow = roleTimedOut ? null : (roleRes as { data: { role: string } | null }).data;
    const isAdmin = prof?.is_platform_admin === true || !!roleRow;
    const onboarded = prof?.has_onboarded === true;
    const path = location.pathname;
    const onWelcome = path === "/welcome" || path.startsWith("/welcome/");
    if (!profTimedOut && !onboarded && !isAdmin && !onWelcome) {
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
  "/home",
  "/welcome",
  "/onboarding",
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
  const { isAdmin } = Route.useRouteContext();

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  // Resolve role home for downstream UI only — DO NOT navigate from here.
  // The previous effect (and its earlier variants) re-fired on every refetch
  // of the my-home query (tab focus, token refresh, SIGNED_IN replay) and
  // randomly bounced users out of Flight Deck back to /admin.
  // Page-level gates own redirects now.
  const homeFn = useServerFn(getMyHome);
  const { data: homeInfo } = useQuery({
    queryKey: ["my-home"],
    queryFn: () => homeFn(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useEffect(() => {
    if (!homeInfo) return;
    try { localStorage.setItem("atlas_role_home", homeInfo.home); } catch { /* ignore */ }
  }, [homeInfo]);


  // Mission setup wizard is a full-page experience — no nav chrome.
  const isWizard =
    path === "/olympus/missions/new" ||
    /^\/olympus\/missions\/[^/]+\/wizard$/.test(path) ||
    /^\/olympus\/wizard\/[^/]+$/.test(path);
  // Hide nav chrome (sidebar + global bar) for onboarding/welcome surfaces.
  const isChromeless =
    isWizard ||
    path === "/welcome" ||
    path === "/onboarding" ||
    path.startsWith("/welcome/") ||
    path.startsWith("/onboarding/");
  if (isChromeless) {
    return <Outlet />;
  }


  const shell = <AuthedShell email={email} isAdmin={isAdmin} />;

  if (isAdmin) return <IrisProvider>{shell}</IrisProvider>;

  if (!isAllowedForNonAdmin(path)) {
    return <Navigate to="/my-work" replace />;
  }

  return <IrisProvider>{shell}</IrisProvider>;
}

function AuthedShell({ email, isAdmin }: { email: string | null; isAdmin: boolean }) {
  const isMobile = useIsMobile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [userName, setUserName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);


  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name,email")
        .eq("id", u.user.id)
        .maybeSingle();
      if (p) {
        setUserName(p.display_name?.trim() || p.email || email);
      } else {
        setUserName(email);
      }
      const { data: m } = await supabase.rpc("current_atlas_member_id");
      if (m) {
        const { data: atm } = await supabase
          .from("atlas_team_members")
          .select("atlas_role")
          .eq("id", m as string)
          .maybeSingle();
        if (atm?.atlas_role) setUserRole(String(atm.atlas_role));
      }
      if (!userRole && isAdmin) setUserRole("admin");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, isAdmin]);

  const onDesk = pathname.startsWith("/olympus/flight-deck");
  const inMission = /^\/(?:olympus\/)?missions\/[^/]+/.test(pathname);
  const inAdmin = pathname.startsWith("/admin");
  const onAthenaCommand = pathname === "/olympus";
  const hideSidebar = onDesk || inMission || inAdmin || onAthenaCommand;
  // AppSidebar is positioned at left: 48px, so desktop content must clear
  // both the 48px command rail and the 200px sidebar or the left edge clips.
  const sidebarWidth = hideSidebar ? 0 : (isMobile ? 96 : 248);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GlobalCommandBar email={email} isAdmin={isAdmin} />
      {!hideSidebar && <AppSidebar userName={userName} userRole={userRole} />}

      <main style={{ marginLeft: sidebarWidth, paddingTop: 0, position: "relative" }}>
        <Outlet />
      </main>
      <AskIrisPanel />
    </div>
  );
}




