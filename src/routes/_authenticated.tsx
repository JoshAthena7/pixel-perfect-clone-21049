import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/war-room/AppSidebar";
import { WriterSidebar } from "@/components/war-room/WriterSidebar";
import { EngagementProvider, useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Toaster } from "@/components/ui/sonner";
import { SubmissionBanner } from "@/components/war-room/SubmissionBanner";
import { LivePresence } from "@/components/war-room/LivePresence";
import { MissionHierarchyTopbar } from "@/components/war-room/MissionHierarchyTopbar";
import { TMinusStrip } from "@/components/war-room/writer/TMinusStrip";
import { DailyQuote } from "@/components/war-room/writer/DailyQuote";
import { SinceLastSeenStrip } from "@/components/war-room/writer/SinceLastSeenStrip";
import { WriterContactBar } from "@/components/war-room/writer/WriterContactBar";
import { CommsProvider } from "@/hooks/use-comms";
import { QuickChatPanel } from "@/components/war-room/comms/QuickChatPanel";
import { ChatNavButton } from "@/components/war-room/comms/ChatNavButton";
import { WriterActionLauncher } from "@/components/war-room/writer/WriterActionLauncher";
import { DailyCheckin } from "@/components/war-room/writer/DailyCheckin";
import { FlagIssueButton } from "@/components/war-room/FlagIssueButton";
import { AskAthenaWidget } from "@/components/war-room/AskAthenaWidget";
import { supabase } from "@/integrations/supabase/client";
import { trackLogin, resetLoginTracker } from "@/lib/login-tracking";
import { useSessionTimeout } from "@/hooks/use-session-timeout";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

const MFA_PATH = "/mfa-enrollment";

function useMfaGate(userId: string | null | undefined) {
  const [needsEnroll, setNeedsEnroll] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!userId) { setNeedsEnroll(null); return; }
    (async () => {
      try {
        const { data } = await supabase.auth.mfa.listFactors();
        const hasVerified = !!data?.totp?.some((f) => f.status === "verified");
        if (!cancelled) setNeedsEnroll(!hasVerified);
      } catch {
        if (!cancelled) setNeedsEnroll(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);
  return needsEnroll;
}




// Writer/SME users see ONLY the writer pages — no shared command-center routes.
const WRITER_ALLOWED_SHARED = new Set<string>([]);

function AuthLayout() {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const needsMfa = useMfaGate(user?.id ?? null);

  useSessionTimeout(!!user);

  useEffect(() => {
    if (!loading && !user) {
      resetLoginTracker();
      navigate({ to: "/login", replace: true });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) void trackLogin(user.id, user.email ?? null);
  }, [user]);

  // Force MFA enrollment before any war-room content is accessible
  useEffect(() => {
    if (!user || needsMfa === null) return;
    if (needsMfa && pathname !== MFA_PATH) {
      navigate({ to: MFA_PATH, replace: true });
    } else if (!needsMfa && pathname === MFA_PATH) {
      navigate({ to: "/command", replace: true });
    }
  }, [user, needsMfa, pathname, navigate]);

  if (loading || !user || needsMfa === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  // MFA gate page — render bare (no engagement context required)
  if (needsMfa && pathname === MFA_PATH) {
    return (
      <>
        <Outlet />
        <Toaster theme="dark" position="top-right" />
      </>
    );
  }

  return (
    <EngagementProvider>
      <CommsProvider>
        <RoleGuardedShell />
      </CommsProvider>
    </EngagementProvider>
  );
}

const PICKER_PATHS = new Set(["/select-engagement", "/overview", "/engagement/new"]);
const NDA_PATH = "/nda-required";

function isAdminPath(p: string) {
  return p === "/admin" || p.startsWith("/admin/");
}

function RoleGuardedShell() {
  const { member, memberships, loading, engagement, ndaSatisfied, isLeadership } = useEngagement();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const isWriterPath = pathname.startsWith("/writer");
  const isWriter = !!member && !isLeadership;
  const onAdmin = isAdminPath(pathname);
  const onPicker = PICKER_PATHS.has(pathname) || onAdmin;
  const onNdaGate = pathname === NDA_PATH;

  useEffect(() => {
    if (loading) return;
    if (onPicker) return;
    // No engagement selected but user has memberships → send to picker
    if (!engagement) {
      navigate({ to: "/select-engagement", replace: true });
      return;
    }
    if (!member) return;
    // NDA gate — non-leadership members without confirmed NDA see only the gate page
    if (!isLeadership && !ndaSatisfied) {
      if (!onNdaGate) navigate({ to: NDA_PATH, replace: true });
      return;
    }
    // If they're satisfied but still on the gate page, route them home
    if (onNdaGate) {
      navigate({ to: isWriter ? "/writer/my-sections" : "/command", replace: true });
      return;
    }
    const isWriterAllowed = isWriterPath || WRITER_ALLOWED_SHARED.has(pathname);
    if (isWriter && !isWriterAllowed) {
      navigate({ to: "/writer/my-sections", replace: true });
    } else if (!isWriter && isWriterPath) {
      navigate({ to: "/command", replace: true });
    }
  }, [loading, member, engagement, isWriter, isWriterPath, onPicker, onNdaGate, ndaSatisfied, isLeadership, pathname, navigate]);

  // Picker / overview / NDA gate render full-bleed without the war-room shell
  if (onPicker || onNdaGate) {
    return (
      <>
        <div className="pb-14"><Outlet /></div>
        <AskAthenaWidget />
        <Toaster theme="dark" position="top-right" />
      </>
    );
  }

  if (!engagement) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        {memberships.length === 0 ? "Setting up your workspace…" : "Loading engagement…"}
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        {isWriter ? <WriterSidebar /> : <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur">
            <SidebarTrigger />
            <MissionHierarchyTopbar />
            {!isWriter && <LivePresence />}
            <ChatNavButton />
          </header>
          {!isWriter && <SubmissionBanner />}
          {isWriter && (
            <>
              <TMinusStrip />
              <DailyQuote />
              <SinceLastSeenStrip />
            </>
          )}
          <main className={`flex-1 overflow-auto pb-14 ${isWriter ? "pb-20" : ""}`}>
            {isWriter ? (
              <div className="flex min-h-full">
                <WriterActionLauncher />
                <div className="flex-1 min-w-0"><Outlet /></div>
              </div>
            ) : (
              <Outlet />
            )}
          </main>
          {isWriter && <WriterContactBar />}
        </div>
      </div>
      <QuickChatPanel />
      {isWriter && <DailyCheckin />}
      <FlagIssueButton />
      <AskAthenaWidget />
      <Toaster theme="dark" position="top-right" />
    </SidebarProvider>
  );
}

