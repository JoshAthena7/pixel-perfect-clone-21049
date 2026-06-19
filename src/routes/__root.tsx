import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { GlobalSearch } from "@/components/nav/GlobalSearch";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Page not found.</p>
        <Link to="/" className="mt-6 inline-block text-primary hover:underline">Go home</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ATLAS" },
      { name: "description", content: "ATLAS — Proposal Intelligence and Alignment System. Built by Athena Strategy Command. Powered by IRIS™." },
      { name: "theme-color", content: "#0a0e1a" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isTransitioning = useRouterState({ select: (s) => s.isTransitioning });
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <GlobalSearch />
      <main className={isTransitioning ? "atlas-route-frame is-transitioning" : "atlas-route-frame"}>
        <Outlet />
      </main>
      <Toaster theme="dark" position="top-right" />
    </QueryClientProvider>
  );
}

function AuthSync() {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    let signOutCheck: number | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // CRITICAL: do NOT call router.invalidate() on SIGNED_IN.
      // Supabase fires SIGNED_IN on initial session restore AND on every token
      // refresh (~1h), and invalidate() re-runs every matched route's
      // beforeLoad/loader. That re-evaluation randomly bounced users out of
      // pages like Flight Deck. Sign-in flows already navigate explicitly.
      if (event === "SIGNED_OUT") {
        if (signOutCheck) window.clearTimeout(signOutCheck);
        signOutCheck = window.setTimeout(() => {
          void supabase.auth.getSession().then(({ data }) => {
            if (data.session) return;
            void qc.cancelQueries();
            qc.clear();
            void router.invalidate();
          });
        }, 1200);
        return;
      }
      // USER_UPDATED is fine to leave as a no-op; consumers that care about
      // profile changes refetch their own queries.
    });
    return () => {
      if (signOutCheck) window.clearTimeout(signOutCheck);
      subscription.unsubscribe();
    };
  }, [router, qc]);
  return null;
}

