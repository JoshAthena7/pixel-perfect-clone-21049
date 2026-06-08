import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { LogOut, User as UserIcon, LayoutDashboard, Brain, Archive, ListChecks, Map as MapIcon, ChevronDown, LifeBuoy, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMissionOverview } from "@/lib/v1/mission.functions";
import { isPmRole } from "@/lib/v1/mission";
import { useHasSupabaseSession } from "@/hooks/useSupabaseSession";

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
  const hasSession = useHasSupabaseSession();
  const { data } = useQuery({
    queryKey: ["v1-overview-shell"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
    enabled: hasSession === true,
    retry: false,
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  const initials = (name ?? "U")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-2 rounded-md border border-[color:var(--v1-border)] px-2 py-1.5 text-xs hover:bg-[color:var(--v1-surface-hover)]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--v1-primary)]/20 text-[10px] font-semibold text-[color:var(--v1-primary)]">
          {initials}
        </span>
        {name && (
          <span className="hidden sm:inline text-[color:var(--v1-text)]">{name}</span>
        )}
        <ChevronDown className="h-3 w-3 text-[color:var(--v1-muted)]" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-56 rounded-md border border-[color:var(--v1-border)] bg-[color:var(--v1-surface)] py-1 shadow-lg z-50"
        >
          <MenuLink to="/profile" icon={UserIcon} label="Profile" onClick={() => setOpen(false)} />
          <MenuLink
            to="/profile"
            search={{ tab: "privacy" as const }}
            icon={ShieldCheck}
            label="Data & Privacy"
            onClick={() => setOpen(false)}
          />
          <MenuLink
            to="/profile"
            search={{ tab: "help" as const }}
            icon={LifeBuoy}
            label="Help & Support"
            onClick={() => setOpen(false)}
          />
          <div className="my-1 h-px bg-[color:var(--v1-border)]" />
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[color:var(--v1-text)] hover:bg-[color:var(--v1-surface-hover)]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  to,
  search,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  search?: Record<string, string>;
  icon: typeof UserIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to as any}
      search={search as any}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 text-xs text-[color:var(--v1-text)] hover:bg-[color:var(--v1-surface-hover)]"
    >
      <Icon className="h-3.5 w-3.5 text-[color:var(--v1-muted)]" />
      {label}
    </Link>
  );
}
