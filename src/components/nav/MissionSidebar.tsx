/**
 * Per-mission left sidebar (200px). Replaces the previous top tab bar
 * (Briefing | IRIS | Insights) with a 4-destination icon+label rail:
 * BRIEF, INTELLIGENCE, FLIGHT DECK, OLYMPUS. Includes an Intel Summary
 * panel and a bottom strip with notifications + user avatar.
 *
 * On viewports < 768px, the sidebar hides itself and a bottom tab bar
 * with the same destinations is rendered instead (see MissionBottomTabs).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ClipboardList, Eye, Rocket, Settings, Check, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { UserMenu } from "@/components/nav/UserMenu";
import { useMissionMeta } from "@/hooks/useMissionMeta";

const GOLD = "#d4a843";
const MUTED = "#666680";

type NavItem = {
  id: string;
  label: string;
  Icon: typeof ClipboardList;
  to: string;
  matchSegs: string[];
};

function buildItems(missionId: string): NavItem[] {
  return [
    {
      id: "brief",
      label: "BRIEF",
      Icon: ClipboardList,
      to: `/missions/${missionId}/briefing`,
      matchSegs: ["briefing", ""],
    },
    {
      id: "intelligence",
      label: "INTELLIGENCE",
      Icon: Eye,
      to: `/missions/${missionId}/oracle`,
      matchSegs: ["oracle", "insights"],
    },
    {
      id: "flight-deck",
      label: "FLIGHT DECK",
      Icon: Rocket,
      to: `/missions/${missionId}/flight-deck`,
      matchSegs: ["flight-deck"],
    },
    {
      id: "olympus",
      label: "OLYMPUS",
      Icon: Settings,
      to: `/admin`,
      matchSegs: ["__admin__"],
    },
  ];
}

function useIntelSummary(missionId: string) {
  const { data: meta } = useMissionMeta(missionId);
  const { data: counts } = useQuery({
    queryKey: ["mission-intel-summary", missionId],
    enabled: !!missionId,
    staleTime: 30_000,
    queryFn: async () => {
      const [events, people, orgs] = await Promise.all([
        supabase.from("intel_events").select("id", { head: true, count: "exact" }).eq("mission_id", missionId),
        supabase.from("intel_people").select("id", { head: true, count: "exact" }).eq("mission_id", missionId),
        supabase.from("intel_organizations").select("id", { head: true, count: "exact" }).eq("mission_id", missionId),
      ]);
      return {
        events: events.count ?? 0,
        people: people.count ?? 0,
        orgs: orgs.count ?? 0,
      };
    },
  });
  return {
    completeness: Math.round(meta?.intelligence_graph_completeness ?? 0),
    events: counts?.events ?? 0,
    people: counts?.people ?? 0,
    orgs: counts?.orgs ?? 0,
  };
}

function activeForSeg(item: NavItem, seg: string, pathname: string): boolean {
  if (item.id === "olympus") return pathname.startsWith("/admin");
  return item.matchSegs.includes(seg);
}

export function MissionSidebar({ missionId, email }: { missionId: string; email?: string | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const seg = pathname.split("/")[3] ?? "";
  const items = buildItems(missionId);
  const intel = useIntelSummary(missionId);

  return (
    <aside
      className="hidden md:flex shrink-0 flex-col"
      style={{
        width: 200,
        background: "#070f1c",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        minHeight: "calc(100vh - 48px)",
      }}
    >
      <MissionSwitcher missionId={missionId} />
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      <nav className="flex flex-col py-2">
        {items.map((it) => {
          const active = activeForSeg(it, seg, pathname);
          const color = active ? GOLD : MUTED;
          return (
            <Link
              key={it.id}
              to={it.to as never}
              className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
              style={{
                borderLeft: `3px solid ${active ? GOLD : "transparent"}`,
                background: active ? "rgba(212,168,67,0.06)" : "transparent",
              }}
            >
              <it.Icon className="h-[16px] w-[16px] shrink-0" style={{ color }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.06em",
                  color,
                }}
              >
                {it.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-2">
        <Link
          to="/olympus/wizard/$missionId"
          params={{ missionId }}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
          title="Open the setup wizard to edit mission details"
        >
          <Wand2 className="h-[14px] w-[14px] shrink-0" style={{ color: GOLD }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(255,255,255,0.78)" }}>
            EDIT SETUP
          </span>
        </Link>
      </div>

      <div className="mx-3 my-3" style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      <div className="px-4 pb-3">
        <div
          className="mb-2"
          style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", fontWeight: 600 }}
        >
          INTEL
        </div>
        <ul className="space-y-1.5" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
          <SummaryRow label="Completeness" value={`${intel.completeness}%`} />
          <SummaryRow label="Feed" value={String(intel.events)} />
          <SummaryRow label="People" value={String(intel.people)} />
          <SummaryRow label="Orgs" value={String(intel.orgs)} />
        </ul>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 px-3 py-3 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <NotificationBell />
        <UserMenu email={email ?? undefined} />
      </div>
    </aside>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between">
      <span style={{ color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <span style={{ color: "white", fontWeight: 600 }}>{value}</span>
    </li>
  );
}

/* -------------------- Mission Switcher -------------------- */
function MissionSwitcher({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: currentMeta } = useMissionMeta(missionId);

  const { data: missions = [] } = useQuery({
    queryKey: ["sidebar-mission-switcher"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,status")
        .in("status", ["active", "setup"])
        .order("name", { ascending: true });
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const currentName = currentMeta?.name ?? "Select mission";

  return (
    <div ref={ref} className="relative px-3 pt-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 rounded-md px-2.5 py-2 transition-colors hover:bg-white/[0.04]"
        style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
      >
        <div className="min-w-0 text-left">
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.1em",
              color: "rgba(255,255,255,0.4)",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            Mission
          </div>
          <div
            className="truncate"
            style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.88)", letterSpacing: "0.02em" }}
            title={currentName}
          >
            {currentName}
          </div>
        </div>
        <ChevronDown
          size={14}
          style={{
            color: "rgba(255,255,255,0.5)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms",
            flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div
          className="absolute z-50 left-3 right-3 mt-1 rounded-md overflow-hidden shadow-xl"
          style={{
            background: "#0c1525",
            border: "1px solid rgba(255,255,255,0.1)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {missions.length === 0 ? (
            <div className="px-3 py-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              No missions
            </div>
          ) : (
            missions.map((m) => {
              const isCurrent = m.id === missionId;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!isCurrent) {
                      navigate({ to: "/missions/$missionId/briefing", params: { missionId: m.id } });
                    }
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
                  style={{
                    background: isCurrent ? "rgba(212,168,67,0.08)" : "transparent",
                  }}
                >
                  <span
                    className="truncate"
                    style={{
                      fontSize: 12,
                      color: isCurrent ? GOLD : "rgba(255,255,255,0.85)",
                      fontWeight: isCurrent ? 600 : 500,
                    }}
                    title={m.name}
                  >
                    {m.name}
                  </span>
                  {isCurrent && <Check size={12} style={{ color: GOLD, flexShrink: 0 }} />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------- Mobile Bottom Tab Bar -------------------- */
export function MissionBottomTabs({ missionId }: { missionId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const seg = pathname.split("/")[3] ?? "";
  const items = buildItems(missionId);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4"
      style={{
        background: "#070f1c",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {items.map((it) => {
        const active = activeForSeg(it, seg, pathname);
        const color = active ? GOLD : MUTED;
        return (
          <Link
            key={it.id}
            to={it.to as never}
            className="flex flex-col items-center gap-0.5 py-2 transition-colors"
            style={{
              borderTop: `2px solid ${active ? GOLD : "transparent"}`,
              background: active ? "rgba(212,168,67,0.06)" : "transparent",
            }}
          >
            <it.Icon className="h-[16px] w-[16px]" style={{ color }} />
            <span style={{ fontSize: 9, fontWeight: active ? 600 : 500, color, letterSpacing: "0.04em" }}>
              {it.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
