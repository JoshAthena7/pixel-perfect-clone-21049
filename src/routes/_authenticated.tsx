import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/war-room/AppSidebar";
import { WriterSidebar } from "@/components/war-room/WriterSidebar";
import { EngagementProvider, useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Toaster } from "@/components/ui/sonner";
import { SubmissionBanner } from "@/components/war-room/SubmissionBanner";
import { LivePresence } from "@/components/war-room/LivePresence";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const PAGE_TITLES: Record<string, string> = {
  "/command": "Command Center",
  "/huddle": "Daily Huddle",
  "/sos": "SOS Alerts",
  "/team": "Team Roster",
  "/risks": "Risks",
  "/heatmap": "Heat Map",
  "/intel": "Intelligence Center",
  "/decisions": "Decision Log",
  "/pulse": "Client Pulse",
  "/broadcasts": "Broadcasts",
  "/snapshots": "Snapshot Log",
  "/assistant": "AI Assistant",
  "/settings": "Settings",
  "/writer/broadcasts": "Broadcasts",
  "/writer/decisions": "Decisions",
  "/writer/intel-library": "Intel Library",
  "/writer/submit-risk": "Submit a Risk",
  "/writer/submit-sos": "Submit an SOS",
  "/writer/team": "Team Directory",
};

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
      <RoleGuardedShell />
    </EngagementProvider>
  );
}

function RoleGuardedShell() {
  const { member, loading } = useEngagement();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isWriterPath = pathname.startsWith("/writer");
  const isWriter = member?.role === "writer";

  useEffect(() => {
    if (loading || !member) return;
    if (isWriter && !isWriterPath) {
      navigate({ to: "/writer/broadcasts", replace: true });
    } else if (!isWriter && isWriterPath) {
      navigate({ to: "/command", replace: true });
    }
  }, [loading, member, isWriter, isWriterPath, navigate]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        {isWriter ? <WriterSidebar /> : <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur">
            <SidebarTrigger />
            <AppHeaderContent />
          </header>
          {!isWriter && <SubmissionBanner />}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <Toaster theme="dark" position="top-right" />
    </SidebarProvider>
  );
}

function AppHeaderContent() {
  const { engagement, loading, member } = useEngagement();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const pageTitle = PAGE_TITLES[pathname] ?? "";
  const isWriter = member?.role === "writer";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
      <span className="hidden md:inline text-[10px] uppercase tracking-[0.18em] text-[var(--gold)] font-semibold whitespace-nowrap">
        {isWriter ? "Athena Writer Portal" : "Athena War Room"}
      </span>
      <span className="hidden md:inline text-muted-foreground">/</span>
      {pageTitle && <span className="font-bold text-sm truncate">{pageTitle}</span>}

      <span className="ml-auto flex items-center gap-3 min-w-0">
        {loading ? (
          <span className="text-muted-foreground truncate">Loading engagement…</span>
        ) : engagement ? (
          <>
            <span className="font-semibold truncate max-w-[28vw]">{engagement.name}</span>
            <span className="text-muted-foreground hidden lg:inline truncate">/ {engagement.client}</span>
            {!isWriter && (
              <>
                <span className="text-muted-foreground hidden md:inline">•</span>
                <LivePresence />
              </>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">No engagement</span>
        )}
      </span>
    </div>
  );
}
