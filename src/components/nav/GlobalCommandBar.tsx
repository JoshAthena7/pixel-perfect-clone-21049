import { Link, useRouterState } from "@tanstack/react-router";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MissionSwitcher } from "./MissionSwitcher";
import { IntelAlertCount } from "./IntelAlertCount";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/utils";
import athenaMark from "@/assets/athena-mark-v3.png.asset.json";
import atlasWordmark from "@/assets/atlas-wordmark-optical.png";

const NAV_ITEMS = [
  { to: "/missions", label: "Missions", match: (p: string) => p === "/missions" || p.startsWith("/missions") || p.startsWith("/olympus/missions") },
  { to: "/team", label: "Team", match: (p: string) => p === "/team" || p.startsWith("/team") || p.startsWith("/admin/team") },
  { to: "/reports", label: "Reports", match: (p: string) => p.startsWith("/reports") },
];

export function GlobalCommandBar({ email }: { email?: string | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="sticky top-0 z-50 h-11 bg-[#0D1B3E] border-b border-[#C49A2B]/40 text-white px-4 sm:px-6">
      <div className="mx-auto max-w-7xl h-full grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <div className="flex items-center gap-6">
          <Link
            to="/missions"
            className="flex items-center gap-2.5 group select-none"
            aria-label="ATLAS — Athena Strategy Group"
          >
            <img
              src={athenaMark.url}
              alt=""
              aria-hidden
              draggable={false}
              className="h-7 w-7 object-contain shrink-0 transition-transform group-hover:scale-105"
            />
            <img
              src={atlasWordmark}
              alt="ATLAS"
              draggable={false}
              className="h-5 w-auto object-contain"
              style={{ filter: "brightness(1.1) drop-shadow(0 0 6px rgba(196,154,43,0.25))" }}
            />
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((it) => {
              const active = it.match(pathname);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-sm transition-colors",
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:text-white hover:bg-white/5",
                  )}
                >
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex justify-center min-w-0">
          <MissionSwitcher />
        </div>
        <div className="flex items-center gap-3">
          <IntelAlertCount />
          <NotificationBell />
          <UserMenu email={email} />
        </div>
      </div>
    </div>
  );
}
