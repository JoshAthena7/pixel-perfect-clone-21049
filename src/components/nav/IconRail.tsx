import { Link, useRouterState } from "@tanstack/react-router";
import { Crosshair, LayoutGrid, Shield } from "lucide-react";

type RailItem = {
  label: string;
  to: string;
  Icon: typeof Crosshair;
  isActive: (pathname: string) => boolean;
};

const ITEMS: RailItem[] = [
  {
    label: "Mission",
    to: "/home",
    Icon: Crosshair,
    isActive: (p) =>
      p.startsWith("/missions") ||
      p === "/home" ||
      p.startsWith("/olympus/missions"),
  },
  {
    label: "Desk",
    to: "/olympus/flight-deck",
    Icon: LayoutGrid,
    isActive: (p) => p.startsWith("/olympus/flight-deck"),
  },
  {
    label: "Admin",
    to: "/admin",
    Icon: Shield,
    isActive: (p) => p.startsWith("/admin"),
  },
];

export function IconRail() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

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
      {ITEMS.map((it) => {
        const active = it.isActive(pathname);
        const color = active ? "#c9a84c" : "rgba(255,255,255,0.55)";
        return (
          <Link
            key={it.label}
            to={it.to as never}
            className="flex flex-col items-center gap-0.5 py-2 w-full transition-colors hover:bg-white/[0.04]"
            title={it.label}
            style={
              active
                ? { background: "rgba(201,168,76,0.08)", borderLeft: "2px solid #c9a84c" }
                : { borderLeft: "2px solid transparent" }
            }
          >
            <it.Icon className="h-[18px] w-[18px]" style={{ color }} />
            <span
              style={{
                fontSize: 9,
                color,
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.03em",
              }}
            >
              {it.label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
