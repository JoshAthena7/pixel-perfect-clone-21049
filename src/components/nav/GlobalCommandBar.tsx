import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { IntelAlertCount } from "./IntelAlertCount";
import { UserMenu } from "./UserMenu";
import { supabase } from "@/integrations/supabase/client";
import { tabLabel, isValidTab } from "@/components/mission-command/MissionTabs";
import athenaMark from "@/assets/athena-mark-v3.png.asset.json";
import atlasWordmark from "@/assets/atlas-wordmark-optical.png";

type Crumb = { label: string; to?: string; params?: Record<string, string> };

function useCrumbs(): Crumb[] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as unknown as Record<string, unknown>;
  const params = useParams({ strict: false }) as { missionId?: string; step?: string };
  const missionId = params.missionId;

  const { data: missionName } = useQuery({
    queryKey: ["crumb-mission-name", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name")
        .eq("id", missionId!)
        .maybeSingle();
      return data?.name ?? null;
    },
  });

  const olympus: Crumb = { label: "Olympus", to: "/olympus/missions" };
  const missionsCrumb: Crumb = { label: "Missions", to: "/olympus/missions" };

  if (pathname === "/olympus/flight-deck") {
    return [olympus, { label: "Flight Deck" }];
  }
  if (pathname === "/olympus/missions" || pathname === "/olympus/missions/") {
    return [olympus, { label: "Missions" }];
  }
  if (pathname === "/olympus/missions/new") {
    return [olympus, missionsCrumb, { label: "New Mission" }];
  }
  if (missionId && /\/wizard$/.test(pathname)) {
    return [olympus, missionsCrumb, { label: missionName ?? "Mission" }, { label: "Setup" }];
  }
  if (missionId) {
    const tab = typeof search.tab === "string" && isValidTab(search.tab) ? search.tab : "overview";
    return [
      olympus,
      missionsCrumb,
      { label: missionName ?? "Mission", to: "/olympus/missions/$missionId", params: { missionId } },
      { label: tabLabel(tab) },
    ];
  }
  if (pathname.startsWith("/admin/team")) {
    return [olympus, { label: "Team" }];
  }
  if (pathname.startsWith("/reports")) {
    return [olympus, { label: "Reports" }];
  }
  if (pathname.startsWith("/admin")) {
    return [olympus, { label: "Admin" }];
  }
  if (pathname.startsWith("/profile")) {
    return [olympus, { label: "Profile" }];
  }
  return [olympus];
}

function Breadcrumb() {
  const crumbs = useCrumbs();
  return (
    <nav className="hidden md:flex items-center gap-1.5 text-[13px] min-w-0 overflow-hidden">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
            {c.to && !last ? (
              <Link
                to={c.to as any}
                params={c.params as any}
                className="text-white/40 hover:text-white truncate"
              >
                {c.label}
              </Link>
            ) : (
              <span className={last ? "text-white font-medium truncate" : "text-white/40 truncate"}>
                {c.label}
              </span>
            )}
            {!last && <span style={{ color: "rgba(196,154,43,0.5)" }}>›</span>}
          </span>
        );
      })}
    </nav>
  );
}

export function GlobalCommandBar({ email }: { email?: string | null }) {
  return (
    <div className="sticky top-0 z-50 h-11 bg-[#0a1628] border-b border-white/[0.06] text-white px-4 sm:px-6">
      <div className="mx-auto max-w-7xl h-full grid grid-cols-[auto_1fr_auto] items-center gap-4">
        <Link
          to="/olympus/missions"
          className="flex items-center gap-2.5 group select-none shrink-0"
          aria-label="ATLAS"
        >
          <img
            src={athenaMark.url}
            alt=""
            aria-hidden
            draggable={false}
            className="h-5 w-5 object-contain shrink-0"
          />
          <img
            src={atlasWordmark}
            alt="ATLAS"
            draggable={false}
            className="h-4 w-auto object-contain hidden sm:block"
            style={{ filter: "brightness(1.1) drop-shadow(0 0 6px rgba(196,154,43,0.25))" }}
          />
        </Link>
        <div className="min-w-0">
          <Breadcrumb />
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
