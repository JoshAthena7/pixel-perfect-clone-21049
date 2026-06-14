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
import { ChevronDown, ClipboardList, Eye, Rocket, Settings, Check } from "lucide-react";
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
