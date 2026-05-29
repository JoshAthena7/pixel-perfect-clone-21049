import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/war-room/AppSidebar";
import { EngagementProvider, useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Toaster } from "@/components/ui/sonner";
import { SubmissionBanner } from "@/components/war-room/SubmissionBanner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <EngagementProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur">
              <SidebarTrigger />
              <EngagementHeader />
            </header>
            <SubmissionBanner />
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
          </div>
        </div>
        <Toaster theme="dark" position="top-right" />
      </SidebarProvider>
    </EngagementProvider>
  );
}

function EngagementHeader() {
  const { engagement, loading } = useEngagement();
  if (loading) return <span className="text-xs text-muted-foreground">Bootstrapping engagement…</span>;
  if (!engagement) return <span className="text-xs text-muted-foreground">No engagement</span>;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="live-dot text-muted-foreground">Live</span>
      <span className="text-muted-foreground">•</span>
      <span className="font-semibold">{engagement.name}</span>
      <span className="text-muted-foreground">/ {engagement.client}</span>
    </div>
  );
}
