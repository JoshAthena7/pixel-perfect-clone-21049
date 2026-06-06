import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, User as UserIcon, LayoutDashboard, Brain, Archive, ListChecks, Map as MapIcon, ListTodo } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMissionOverview } from "@/lib/v1/mission.functions";
import { isPmRole } from "@/lib/v1/mission";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; pmOnly?: boolean };
const NAV: NavItem[] = [
  { to: "/v1/command", label: "Mission Command", icon: LayoutDashboard, pmOnly: true },
  { to: "/v1/sections", label: "Sections", icon: ListChecks },
  { to: "/v1/intel", label: "Mission Intel", icon: Brain },
  { to: "/v1/vault", label: "Mission Vault", icon: Archive },
  { to: "/v1/journey", label: "Journey Map", icon: MapIcon },
];

export function V1Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const fetchOverview = useServerFn(getMissionOverview);
  const { data } = useQuery({
    queryKey: ["v1-overview-shell"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
  });
  const mission = data?.mission;
  const isPm = isPmRole(data?.myRole);

  const daysToSubmission = mission?.submission_date
    ? Math.max(0, Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="min-h-screen v1-root flex flex-col">
      {/* Top bar */}
      <header className="border-b border-[color:var(--v1-border)] bg-[color:var(--v1-surface)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/v1" className="font-bold text-lg tracking-tight text-[color:var(--v1-text)]">
            ATLAS
          </Link>
          {mission && (
            <div className="flex items-center gap-3 text-xs text-[color:var(--v1-muted)]">
              <span className="font-semibold text-[color:var(--v1-text)]">{mission.name}</span>
              <span>·</span>
              <span>{mission.client.split(/[,.]/)[0].trim()}</span>
              {daysToSubmission !== null && (
                <>
                  <span>·</span>
                  <span className={daysToSubmission < 14 ? "text-[color:var(--v1-amber)]" : ""}>
                    ⏱ {daysToSubmission} days to submission
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/v1/my-sections"
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--v1-border)] px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--v1-surface-hover)]"
          >
            <ListTodo className="h-3.5 w-3.5" /> My Sections
          </Link>
          <UserMenu name={data?.myName ?? null} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left nav */}
        <aside className="w-56 shrink-0 border-r border-[color:var(--v1-border)] bg-[color:var(--v1-surface)] p-3">
          <nav className="space-y-1">
            {NAV.filter((n) => !n.pmOnly || isPm).map((item) => {
              const active = path === item.to || (item.to === "/v1/sections" && path.startsWith("/v1/sections"));
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-[color:var(--v1-primary)]/15 text-[color:var(--v1-primary)] font-semibold"
                      : "text-[color:var(--v1-muted)] hover:bg-[color:var(--v1-surface-hover)] hover:text-[color:var(--v1-text)]"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function UserMenu({ name }: { name: string | null }) {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
  return (
    <div className="flex items-center gap-2">
      {name && (
        <span className="text-xs text-[color:var(--v1-muted)] hidden sm:inline">
          <UserIcon className="inline h-3 w-3 mr-1" />
          {name}
        </span>
      )}
      <button
        onClick={handleSignOut}
        className="inline-flex items-center gap-1 rounded-md border border-[color:var(--v1-border)] px-2 py-1.5 text-xs hover:bg-[color:var(--v1-surface-hover)]"
        title="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
