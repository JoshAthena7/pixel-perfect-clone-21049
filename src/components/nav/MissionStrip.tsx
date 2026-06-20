import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar, AlertTriangle, Command, MoreHorizontal } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ALL_TABS, type TabId, isValidTab, useViewerMissionRole, visibleTabsForRole } from "@/components/mission-command/MissionTabs";
import { MissionSwitcher } from "./MissionSwitcher";
import { QuickJump } from "./QuickJump";

function useMissionId(): string | undefined {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = useParams({ strict: false }) as { missionId?: string };
  const inside =
    /^\/olympus\/missions\/[^/]+/.test(pathname) &&
    !pathname.endsWith("/new") &&
    !pathname.endsWith("/wizard");
  return inside ? params.missionId : undefined;
}

type MissionCtx = {
  id: string;
  name: string;
  client_name: string | null;
  program_type: string | null;
  status: string;
  submission_deadline: string | null;
  intelligence_graph_completeness: number | null;
  at_risk: number;
  team_count: number;
};

async function fetchMissionCtx(missionId: string): Promise<MissionCtx> {
  const [{ data: m, error: mErr }, atRisk, team] = await Promise.all([
    supabase
      .from("missions")
      .select("id,name,client_name,program_type,status,submission_deadline,intelligence_graph_completeness")
      .eq("id", missionId)
      .maybeSingle(),
    supabase
      .from("mission_questions")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("health_status", "at_risk"),
    supabase
      .from("mission_team_members")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId),
  ]);
  if (mErr) throw mErr;
  return {
    id: missionId,
    name: m?.name ?? "Mission",
    client_name: m?.client_name ?? null,
    program_type: m?.program_type ?? null,
    status: m?.status ?? "setup",
    submission_deadline: m?.submission_deadline ?? null,
    intelligence_graph_completeness: m?.intelligence_graph_completeness ?? null,
    at_risk: atRisk.count ?? 0,
    team_count: team.count ?? 0,
  };
}

async function fetchTabAlertsLite(missionId: string) {
  const [atRisk, intel] = await Promise.all([
    supabase.from("mission_questions").select("id", { count: "exact", head: true })
      .eq("mission_id", missionId).eq("health_status", "at_risk"),
    supabase.from("intelligence_feed_items").select("id", { count: "exact", head: true })
      .eq("mission_id", missionId).gte("iris_relevance_score", 70).eq("is_reviewed", false),
  ]);
  return {
    "question-health": atRisk.count ?? 0,
    "oracle": intel.count ?? 0,
  } as Partial<Record<TabId, number>>;
}

export function MissionStrip() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search }) as unknown as Record<string, unknown>;
  const navigate = useNavigate();
  const missionId = useMissionId();

  const jumpBtnRef = useRef<HTMLButtonElement>(null);
  const [jumpOpen, setJumpOpen] = useState(false);

  const { data: ctx } = useQuery({
    queryKey: ["mission-strip-ctx", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchMissionCtx(missionId!),
  });

  const { data: tabAlerts = {} } = useQuery({
    queryKey: ["mission-strip-tab-alerts", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchTabAlertsLite(missionId!),
  });

  const activeTab: TabId | undefined = useMemo(() => {
    if (!missionId) return undefined;
    const t = typeof search.tab === "string" ? search.tab : "";
    return isValidTab(t) ? t : "overview";
  }, [search.tab, missionId]);

  const days = ctx?.submission_deadline
    ? differenceInCalendarDays(new Date(ctx.submission_deadline), new Date())
    : null;
  const dayColor =
    days === null ? "text-white" : days < 0 ? "text-red-400" : days < 14 ? "text-red-400" : days < 30 ? "text-amber-400" : "text-white";

  const isMissionsList = pathname === "/olympus/missions" || pathname === "/olympus/missions/";
  const isTeam = pathname.startsWith("/admin/team") || pathname === "/team";
  const isReports = pathname.startsWith("/reports");
  const isFlightDeck = pathname.startsWith("/olympus/flight-deck");

  const simpleLabel =
    isMissionsList ? "Mission Portfolio"
    : isTeam ? "Athena Collective"
    : isReports ? "Fast Reports"
    : isFlightDeck && !missionId ? "Flight Deck"
    : "";

  const switchToTab = (id: TabId) => {
    if (!missionId) return;
    navigate({
      to: "/olympus/missions/$missionId",
      params: { missionId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: id }),
    });
  };

  return (
    <div className="sticky top-11 z-40 bg-[#08111F] border-b border-white/[0.06]">
      {/* ROW 2 — Mission context */}
      <div className="h-10 px-4 sm:px-6 flex items-center">
        <div className="mx-auto max-w-7xl w-full flex items-center gap-3 min-w-0">
          {missionId ? (
            <>
              {/* Identity */}
              <div className="min-w-0 flex items-center gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium text-white truncate leading-tight">
                    {ctx?.name ?? <span className="inline-block h-3 w-32 bg-white/10 rounded animate-pulse" />}
                  </div>
                  <div className="text-[12px] text-white/40 truncate leading-tight">
                    {ctx ? (
                      [ctx.client_name, ctx.program_type].filter(Boolean).join(" · ") || " "
                    ) : (
                      <span className="inline-block h-2 w-48 bg-white/5 rounded animate-pulse" />
                    )}
                  </div>
                </div>
                <span className="hidden md:inline-block h-6 w-px bg-white/10" />
              </div>

              {/* Chips */}
              <div className="hidden md:flex items-center gap-2 min-w-0 overflow-hidden">
                {ctx?.status && <StatusChip status={ctx.status} />}
                {days !== null && (
                  <Chip>
                    <Calendar className="h-3 w-3" />
                    <span className={cn("text-[12px]", dayColor)}>
                      {days < 0 ? `${Math.abs(days)}d past` : `${days} days`}
                    </span>
                  </Chip>
                )}
                {ctx && ctx.at_risk > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[12px] border"
                        style={{ background: "rgba(224,74,74,0.15)", color: "#f08080", borderColor: "rgba(224,74,74,0.3)" }}>
                    <AlertTriangle className="h-3 w-3" /> {ctx.at_risk} at risk
                  </span>
                )}
                {ctx?.intelligence_graph_completeness != null && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[12px]"
                        style={{ background: "rgba(196,154,43,0.15)", color: "#C49A2B" }}>
                    Intel: {Math.round(ctx.intelligence_graph_completeness)}%
                  </span>
                )}
                {ctx && ctx.team_count > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[12px]"
                        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                    {ctx.team_count} team
                  </span>
                )}
              </div>

              {/* Days only on mobile */}
              <div className="md:hidden flex items-center gap-2">
                {days !== null && (
                  <span className={cn("text-[12px]", dayColor)}>
                    {days < 0 ? `${Math.abs(days)}d past` : `${days}d`}
                  </span>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <div className="hidden md:block">
                  <MissionSwitcher />
                </div>
                <button
                  ref={jumpBtnRef}
                  onClick={() => setJumpOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] border"
                  style={{ background: "rgba(196,154,43,0.15)", borderColor: "rgba(196,154,43,0.4)", color: "#C49A2B" }}
                >
                  <Command className="h-3 w-3" /> Jump
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-[14px] text-white/40 truncate">
                {simpleLabel || <span className="text-white/30">Select a mission to see context</span>}
              </span>
              <div className="ml-auto relative">
                <button
                  ref={jumpBtnRef}
                  onClick={() => setJumpOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] border"
                  style={{ background: "rgba(196,154,43,0.15)", borderColor: "rgba(196,154,43,0.4)", color: "#C49A2B" }}
                >
                  <Command className="h-3 w-3" /> Jump
                </button>
                <QuickJump
                  open={jumpOpen}
                  onClose={() => setJumpOpen(false)}
                  anchorRef={jumpBtnRef}
                />
              </div>
            </>
          )}

          {missionId && (
            <div className="relative">
              <QuickJump
                open={jumpOpen}
                onClose={() => setJumpOpen(false)}
                anchorRef={jumpBtnRef}
                currentMissionId={missionId}
                activeTab={activeTab}
                alerts={tabAlerts}
              />
            </div>
          )}
        </div>
      </div>

      {/* ROW 3 — Tab pills (only inside a mission) */}
      {missionId && (
        <div className="h-9 px-4 sm:px-6 border-t border-white/[0.04] flex items-center">
          <div className="mx-auto max-w-7xl w-full flex items-center gap-1 overflow-x-auto no-scrollbar">
            <TabPills
              tabs={ALL_TABS}
              activeTab={activeTab}
              alerts={tabAlerts}
              onPick={switchToTab}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2px]"
          style={{ background: "rgba(255,255,255,0.06)" }}>
      {children}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  const styles =
    s === "active" ? { bg: "#C49A2B", color: "#0D1B3E" }
    : s === "setup" ? { bg: "rgba(148,163,184,0.7)", color: "#0D1B3E" }
    : { bg: "rgba(255,255,255,0.1)", color: "white" };
  return (
    <span className="rounded-full px-2 py-[2px] text-[12px] font-medium"
          style={{ background: styles.bg, color: styles.color }}>
      {s}
    </span>
  );
}

function TabPills({
  tabs,
  activeTab,
  alerts,
  onPick,
}: {
  tabs: { id: TabId; label: string }[];
  activeTab?: TabId;
  alerts: Partial<Record<TabId, number>>;
  onPick: (id: TabId) => void;
}) {
  // On mobile, only show first 4 + "more"
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <>
      <div className="hidden md:flex items-center gap-1 min-w-0">
        {tabs.map((t) => (
          <Pill key={t.id} tab={t} active={t.id === activeTab} alerts={alerts} onPick={onPick} />
        ))}
      </div>
      <div className="md:hidden flex items-center gap-1 min-w-0">
        {tabs.slice(0, 4).map((t) => (
          <Pill key={t.id} tab={t} active={t.id === activeTab} alerts={alerts} onPick={onPick} />
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="rounded-full px-3 py-1 text-[12px] shrink-0 inline-flex items-center gap-1"
          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
        >
          <MoreHorizontal className="h-3 w-3" /> More
        </button>
        {moreOpen && (
          <div className="fixed inset-0 z-[80]">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-[#0D1B3E] border-t border-[var(--athena-gold)]/40 p-4 max-h-[70vh] overflow-y-auto">
              <div className="text-[12px] text-[var(--athena-gold)] font-medium mb-3">All Tabs</div>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setMoreOpen(false); onPick(t.id); }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded text-[14px] flex items-center gap-2",
                    t.id === activeTab ? "bg-[var(--athena-gold)]/20 text-[var(--athena-gold)]" : "text-white/80 hover:bg-white/5",
                  )}
                >
                  <span className="flex-1">{t.label}</span>
                  {(alerts[t.id] ?? 0) > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Pill({
  tab, active, alerts, onPick,
}: {
  tab: { id: TabId; label: string };
  active: boolean;
  alerts: Partial<Record<TabId, number>>;
  onPick: (id: TabId) => void;
}) {
  const alertN = alerts[tab.id] ?? 0;
  return (
    <button
      onClick={() => onPick(tab.id)}
      className={cn(
        "shrink-0 rounded-full px-3 py-1 text-[12px] inline-flex items-center gap-1.5 transition-colors",
        active ? "font-medium" : "",
      )}
      style={
        active
          ? { background: "rgba(196,154,43,0.2)", border: "1px solid rgba(196,154,43,0.5)", color: "#C49A2B" }
          : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }
      }
    >
      {tab.label}
      {alertN > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
    </button>
  );
}
