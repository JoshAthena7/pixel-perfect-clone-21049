import { Link, useRouterState, useParams } from "@tanstack/react-router";
import { Building2, Plane, Bell, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";

function isHiddenPath(path: string): boolean {
  if (path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/signup")) return true;
  if (path.startsWith("/admin") || path.startsWith("/olympus")) return true;
  if (path.startsWith("/missions/") && (path.endsWith("/brief") || path.includes("/flight-deck"))) return true;
  if (path.startsWith("/flight-deck")) return true;
  return false;
}

/**
 * Mobile-only fixed bottom navigation.
 * Shown only on screens < 768px. Replaces the desktop room toggle.
 */
export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;

  // Hide entirely on auth/login flows.
  const isAuthRoute = path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/signup");
  if (isAuthRoute) return null;

  // O-1: Bottom nav is for the Atlas user-facing shell only.
  // Never render it inside the Olympus admin shell.
  if (path.startsWith("/admin") || path.startsWith("/olympus")) return null;

  // Hide on the Mission Briefing Room and Flight Deck — their layouts cover navigation.
  if (path.startsWith("/missions/") && (path.endsWith("/brief") || path.includes("/flight-deck"))) return null;
  if (path.startsWith("/flight-deck")) return null;

  const inMission = !!missionId;
  const inSections = path.startsWith("/missions/") && (path.includes("/sections") || path.includes("/scaffold") || path.includes("/iris"));
  const inFlightDeck = path.startsWith("/flight-deck") || (path.startsWith("/missions/") && path.includes("/flight-deck"));

  const items = [
    {
      key: "mission",
      label: "Mission",
      icon: <Building2 size={18} strokeWidth={1.75} />,
      to: inMission ? `/missions/${missionId}/overview` : "/home",
      active: inMission && !inSections,
    },
    {
      key: "sections",
      label: "Sections",
      icon: <Plane size={18} strokeWidth={1.75} />,
      to: inMission ? `/missions/${missionId}/sections` : "/flight-deck",
      active: inSections,
    },
    {
      key: "flight deck",
      label: "Flight Deck",
      icon: <Plane size={18} strokeWidth={1.75} />,
      to: inMission ? `/missions/${missionId}/flight-deck` : "/flight-deck",
      active: inFlightDeck,
    },
    {
      key: "alerts",
      label: "Alerts",
      icon: <Bell size={18} strokeWidth={1.75} />,
      onClick: () => {
        const bell = document.querySelector('[aria-label="Notifications"], [data-notification-bell]') as HTMLButtonElement | null;
        if (bell) bell.click();
      },
      active: false,
    },
    {
      key: "help",
      label: "Help",
      icon: <HelpCircle size={18} strokeWidth={1.75} />,
      onClick: () => {
        window.dispatchEvent(new CustomEvent("atlas:open-search"));
      },
      active: false,
    },
  ] as const;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[1100] h-[58px] border-t flex items-stretch"
      style={{
        background: "rgba(6,11,20,0.96)",
        borderColor: "rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      aria-label="Mobile primary navigation"
    >
      {items.map((it) => {
        const cls = `flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
          it.active ? "text-[color:var(--athena-gold,#f59e0b)]" : "text-muted-foreground"
        }`;
        if ("onClick" in it && it.onClick) {
          return (
            <button key={it.key} onClick={it.onClick} className={cls} aria-label={it.label}>
              {it.icon}
              <span>{it.label}</span>
            </button>
          );
        }
        return (
          <Link key={it.key} to={(it as any).to} className={cls} aria-label={it.label}>
            {it.icon}
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Spacer to reserve room for the fixed bottom nav so page content
 * is not occluded. Only renders on mobile.
 */
export function MobileBottomNavSpacer() {
  const [isMobile, setIsMobile] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  if (!isMobile) return null;
  if (isHiddenPath(path)) return null;
  return <div aria-hidden style={{ height: "calc(58px + env(safe-area-inset-bottom))" }} />;
}
