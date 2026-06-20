import { Link, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { IntelAlertCount } from "./IntelAlertCount";
import { UserMenu } from "./UserMenu";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { supabase } from "@/integrations/supabase/client";
import { tabLabel, isValidTab } from "@/components/mission-command/MissionTabs";
import { cn } from "@/lib/utils";
import { getWriterMissionLanding } from "@/lib/writer-missions.functions";
import atlasWordmark from "@/assets/atlas-wordmark.png.asset.json";

type Crumb = { label: string; to?: string; params?: Record<string, string>; pill?: boolean };

function AtlasLogo() {
  return (
    <img
      src={atlasWordmark.url}
      alt="ATLAS"
      draggable={false}
      style={{ height: 18, width: "auto", objectFit: "contain" }}
    />
  );
}

function useMissionId(): string | undefined {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const inside =
    /^\/olympus\/missions\/[^/]+/.test(pathname) &&
    !pathname.endsWith("/new") &&
    !pathname.endsWith("/wizard");
  return inside ? params.missionId : undefined;
}

async function fetchMissionName(missionId: string): Promise<string> {
  const { data } = await supabase
    .from("missions")
    .select("name")
    .eq("id", missionId)
    .maybeSingle();
  return data?.name ?? "Mission";
}

function useCrumbs(missionName?: string | null): Crumb[] {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as unknown as Record<string, unknown>;
  const params = useParams({ strict: false }) as { missionId?: string };
  const missionId = params.missionId;

  const missionsCrumb: Crumb = { label: "Missions", to: "/olympus/missions" };

  if (pathname === "/olympus/flight-deck") return [{ label: "Flight Deck" }];
  if (pathname === "/olympus/missions" || pathname === "/olympus/missions/") return [{ label: "Missions" }];
  if (pathname === "/olympus/missions/new") return [missionsCrumb, { label: "New Mission" }];
  if (missionId && /\/wizard$/.test(pathname)) {
    return [missionsCrumb, { label: missionName ?? "Mission", pill: true }, { label: "Setup" }];
  }
  if (missionId) {
    const tab = typeof search.tab === "string" && isValidTab(search.tab) ? search.tab : "overview";
    return [
      missionsCrumb,
      { label: missionName ?? "Mission", to: "/olympus/missions/$missionId", params: { missionId }, pill: true },
      { label: tabLabel(tab) },
    ];
  }
  if (pathname.startsWith("/admin/team")) return [{ label: "Team" }];
  if (pathname.startsWith("/reports")) return [{ label: "Reports" }];
  if (pathname.startsWith("/admin")) return [{ label: "Admin" }];
  if (pathname.startsWith("/profile")) return [{ label: "Profile" }];
  return [];
}

export function GlobalCommandBar({ email, isAdmin = false }: { email?: string | null; isAdmin?: boolean }) {
  const missionId = useMissionId();
  const [editOpen, setEditOpen] = useState(false);
  const getLanding = useServerFn(getWriterMissionLanding);

  const { data: missionName } = useQuery({
    queryKey: ["topbar-mission-name", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchMissionName(missionId!),
  });

  const crumbs = useCrumbs(missionName);
  const { data: writerLanding } = useQuery({
    queryKey: ["writer-mission-landing"],
    enabled: !isAdmin,
    staleTime: 60_000,
    queryFn: () => getLanding(),
  });
  const logoMissionId = !isAdmin ? writerLanding?.missions[0]?.id : undefined;

  return (
    <div
      className="sticky top-0 z-50 h-12 text-white px-4 sm:px-6"
      style={{ background: "#070f1c", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      {missionId && (
        <MissionEditPanel missionId={missionId} open={editOpen} onOpenChange={setEditOpen} />
      )}
      <div className="mx-auto max-w-7xl h-full flex items-center gap-3 min-w-0">
        {/* LEFT — Wordmark + primary nav */}
        {logoMissionId ? (
          <Link
            to="/missions/$missionId/briefing"
            params={{ missionId: logoMissionId }}
            className="shrink-0 inline-flex items-center select-none"
            aria-label="ATLAS"
          >
            <AtlasLogo />
          </Link>
        ) : (
          <Link
            to={isAdmin ? "/admin" : "/missions"}
            className="shrink-0 inline-flex items-center select-none"
            aria-label="ATLAS"
          >
            <AtlasLogo />
          </Link>
        )}
        <span className="hidden sm:inline-block h-5 w-px shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />


        {/* Contextual breadcrumb tail — only when inside a mission */}
        {missionId && (
          <nav className="hidden lg:flex items-center gap-1.5 min-w-0 overflow-hidden">
            <span style={{ color: "rgba(196,154,43,0.5)", fontSize: 12 }}>›</span>
            {crumbs.slice(1).map((c, i, arr) => {
              const last = i === arr.length - 1;
              const inner = c.pill ? (
                <span
                  className="inline-flex items-center rounded-full text-white font-medium truncate"
                  style={{ background: "rgba(255,255,255,0.06)", padding: "2px 10px", fontSize: 12 }}
                >
                  {c.label}
                </span>
              ) : (
                <span
                  className={cn("truncate", last ? "text-white font-medium" : "text-white/40")}
                  style={{ fontSize: 12 }}
                >
                  {c.label}
                </span>
              );
              return (
                <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                  {c.to && !last ? (
                    <Link to={c.to as any} params={c.params as any} className="hover:opacity-80 min-w-0">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                  {c.pill && (
                    <button
                      type="button"
                      onClick={() => setEditOpen(true)}
                      aria-label="Edit mission"
                      title="Edit mission"
                      className="text-white/40 hover:text-white shrink-0"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {!last && <span style={{ color: "rgba(196,154,43,0.5)", fontSize: 12 }}>›</span>}
                </span>
              );
            })}
          </nav>
        )}

        {/* RIGHT — Score Draft · Ask IRIS · bell · avatar */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("atlas:iris:open"))}
            className="iris-ask-btn group hidden sm:inline-flex items-center gap-2 rounded-full text-[11px] font-medium pl-1.5 pr-2.5 py-1 relative overflow-hidden"
            aria-label="Ask IRIS"
          >
            <span className="iris-orb" aria-hidden="true">
              <span className="iris-orb-core" />
              <span className="iris-orb-ring" />
            </span>
            <span className="iris-ask-label">Ask IRIS</span>
            <kbd className="iris-ask-kbd hidden md:inline-flex">⌘I</kbd>
            <span className="iris-ask-shimmer" aria-hidden="true" />
          </button>
          <span className="hidden sm:inline-block h-5 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("atlas:global-search:open"))}
            title="Search (⌘K)"
            aria-label="Search"
            className="inline-flex items-center justify-center rounded-md p-1.5 text-white/60 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </button>
          <IntelAlertCount />
          <NotificationBell />
          <UserMenu email={email} />
        </div>
      </div>
    </div>
  );
}

