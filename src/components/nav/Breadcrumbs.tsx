import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { tabLabel, isValidTab } from "@/components/mission-command/MissionTabs";

type Crumb = { label: string; to?: string; params?: Record<string, string> };

function useCrumbs(): Crumb[] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const params = useParams({ strict: false }) as { missionId?: string };
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

  if (pathname === "/olympus/missions" || pathname === "/olympus/missions/") {
    return [{ label: "Olympus", to: "/olympus/missions" }, { label: "Missions" }];
  }
  if (pathname === "/olympus/missions/new") {
    return [
      { label: "Olympus", to: "/olympus/missions" },
      { label: "Missions", to: "/olympus/missions" },
      { label: "New Mission" },
    ];
  }
  if (missionId && /\/wizard$/.test(pathname)) {
    return [
      { label: "Olympus", to: "/olympus/missions" },
      { label: "Missions", to: "/olympus/missions" },
      { label: missionName ?? "Mission" },
      { label: "Setup" },
    ];
  }
  if (missionId) {
    const tab = typeof search.tab === "string" && isValidTab(search.tab) ? search.tab : "overview";
    return [
      { label: "Olympus", to: "/olympus/missions" },
      { label: "Missions", to: "/olympus/missions" },
      { label: missionName ?? "Mission", to: "/olympus/missions/$missionId", params: { missionId } },
      { label: tabLabel(tab) },
    ];
  }
  if (pathname.startsWith("/admin/team")) {
    return [{ label: "Olympus", to: "/olympus/missions" }, { label: "Team" }];
  }
  if (pathname.startsWith("/admin")) {
    return [{ label: "Olympus", to: "/olympus/missions" }, { label: "Admin" }];
  }
  if (pathname.startsWith("/profile")) {
    return [{ label: "Olympus", to: "/olympus/missions" }, { label: "Profile" }];
  }
  return [];
}

export function Breadcrumbs() {
  const crumbs = useCrumbs();
  if (crumbs.length === 0) return null;

  // Mobile: only parent + current
  const mobileCrumbs = crumbs.length > 1 ? crumbs.slice(-2) : crumbs;

  const render = (list: Crumb[], extraClass: string) => (
    <nav className={`flex items-center gap-1.5 text-xs text-muted-foreground ${extraClass}`}>
      {list.map((c, i) => {
        const last = i === list.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
            {c.to && !last ? (
              <Link
                to={c.to as any}
                params={c.params as any}
                className="hover:text-foreground truncate"
              >
                {c.label}
              </Link>
            ) : (
              <span className={last ? "text-foreground truncate" : "truncate"}>{c.label}</span>
            )}
            {!last && <span className="text-[var(--athena-gold)]/60">›</span>}
          </span>
        );
      })}
    </nav>
  );

  return (
    <div className="h-8 border-b border-border bg-surface/30 px-4 sm:px-6 flex items-center">
      <div className="mx-auto max-w-7xl w-full">
        <div className="hidden sm:block">{render(crumbs, "")}</div>
        <div className="sm:hidden">{render(mobileCrumbs, "")}</div>
      </div>
    </div>
  );
}
