import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Crosshair, LayoutGrid, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const LAST_MISSION_KEY = "atlas_last_mission_id";

async function resolveActiveMissionId(): Promise<string | null> {
  // Prefer last-visited (set when entering a mission)
  try {
    const stored = localStorage.getItem(LAST_MISSION_KEY);
    if (stored) {
      const { data } = await supabase.from("missions").select("id").eq("id", stored).maybeSingle();
      if (data?.id) return data.id;
    }
  } catch { /* ignore */ }
  // Fallback to most recently updated mission
  const { data } = await supabase
    .from("missions")
    .select("id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.id as string) ?? null;
}

export function IconRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { missionId?: string };

  // Persist current mission id when inside a mission
  useEffect(() => {
    const m = params.missionId ?? pathname.match(/^\/(?:olympus\/)?missions\/([^/]+)/)?.[1];
    if (m) {
      try { localStorage.setItem(LAST_MISSION_KEY, m); } catch { /* ignore */ }
    }
  }, [pathname, params.missionId]);

  const { data: activeMissionId } = useQuery({
    queryKey: ["rail-active-mission"],
    queryFn: resolveActiveMissionId,
    staleTime: 60_000,
  });

  const missionActive =
    pathname.startsWith("/missions") ||
    pathname === "/home" ||
    pathname.startsWith("/olympus/missions");
  const deskActive = pathname.startsWith("/olympus/flight-deck");
  const adminActive = pathname.startsWith("/admin");

  const handleMissionClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (activeMissionId) {
      navigate({ to: "/missions/$missionId/briefing", params: { missionId: activeMissionId } });
    } else {
      navigate({ to: "/home" });
    }
  };

  const items = [
    {
      label: "Mission",
      Icon: Crosshair,
      active: missionActive,
      onClick: handleMissionClick,
      href: activeMissionId ? `/missions/${activeMissionId}/briefing` : "/home",
    },
    {
      label: "Desk",
      Icon: LayoutGrid,
      active: deskActive,
      href: "/olympus/flight-deck",
    },
    {
      label: "Admin",
      Icon: Shield,
      active: adminActive,
      href: "/admin",
    },
  ];

  return (
    <aside
      className="fixed left-0 z-[59] flex flex-col items-center pt-3 gap-1"
      style={{
        top: 48,
        bottom: 0,
        width: 48,
        background: "#030812",
        borderRight: "0.5px solid rgba(255,255,255,0.05)",
      }}
    >
      {items.map((it) => {
        const color = it.active ? "#c9a84c" : "rgba(255,255,255,0.55)";
        const style: React.CSSProperties = it.active
          ? { background: "rgba(201,168,76,0.08)", borderLeft: "2px solid #c9a84c" }
          : { borderLeft: "2px solid transparent" };
        if (it.onClick) {
          return (
            <a
              key={it.label}
              href={it.href}
              onClick={it.onClick}
              className="flex flex-col items-center gap-0.5 py-2 w-full transition-colors hover:bg-white/[0.04]"
              title={it.label}
              style={style}
            >
              <it.Icon className="h-[18px] w-[18px]" style={{ color }} />
              <span style={{ fontSize: 9, color, fontWeight: it.active ? 600 : 400, letterSpacing: "0.03em" }}>
                {it.label}
              </span>
            </a>
          );
        }
        return (
          <Link
            key={it.label}
            to={it.href as never}
            className="flex flex-col items-center gap-0.5 py-2 w-full transition-colors hover:bg-white/[0.04]"
            title={it.label}
            style={style}
          >
            <it.Icon className="h-[18px] w-[18px]" style={{ color }} />
            <span style={{ fontSize: 9, color, fontWeight: it.active ? 600 : 400, letterSpacing: "0.03em" }}>
              {it.label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
