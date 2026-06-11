import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { Pencil, Plane, Command, AlertTriangle } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { IntelAlertCount } from "./IntelAlertCount";
import { UserMenu } from "./UserMenu";
import { QuickJump } from "./QuickJump";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { supabase } from "@/integrations/supabase/client";
import { tabLabel, isValidTab } from "@/components/mission-command/MissionTabs";
import { cn } from "@/lib/utils";

type Crumb = { label: string; to?: string; params?: Record<string, string>; pill?: boolean };

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
  status: string;
  submission_deadline: string | null;
  intelligence_graph_completeness: number | null;
  at_risk: number;
};

async function fetchMissionCtx(missionId: string): Promise<MissionCtx> {
  const [{ data: m }, atRisk] = await Promise.all([
    supabase
      .from("missions")
      .select("id,name,status,submission_deadline,intelligence_graph_completeness")
      .eq("id", missionId)
      .maybeSingle(),
    supabase
      .from("mission_questions")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("health_status", "at_risk"),
  ]);
  return {
    id: missionId,
    name: m?.name ?? "Mission",
    status: m?.status ?? "setup",
    submission_deadline: m?.submission_deadline ?? null,
    intelligence_graph_completeness: m?.intelligence_graph_completeness ?? null,
    at_risk: atRisk.count ?? 0,
  };
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

function StatusChip({ status }: { status: string }) {
  const s = status.toLowerCase();
  const styles =
    s === "active"
      ? { bg: "rgba(74,200,74,0.12)", color: "#7dcf7d", border: "rgba(74,200,74,0.3)" }
      : s === "setup"
      ? { bg: "rgba(148,163,184,0.15)", color: "#cbd5e1", border: "rgba(148,163,184,0.3)" }
      : { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.15)" };
  return (
    <span
      className="rounded-full px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wider border"
      style={{ background: styles.bg, color: styles.color, borderColor: styles.border }}
    >
      {s}
    </span>
  );
}

export function GlobalCommandBar({ email, isAdmin = false }: { email?: string | null; isAdmin?: boolean }) {
  const missionId = useMissionId();
  const navigate = useNavigate();
  const jumpBtnRef = useRef<HTMLButtonElement>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: ctx } = useQuery({
    queryKey: ["topbar-mission-ctx", missionId],
    enabled: !!missionId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => fetchMissionCtx(missionId!),
  });

  const crumbs = useCrumbs(ctx?.name);

  const days = ctx?.submission_deadline
    ? differenceInCalendarDays(new Date(ctx.submission_deadline), new Date())
    : null;
  const dayColor =
    days === null
      ? "text-white"
      : days < 14
      ? "text-red-400"
      : days < 30
      ? "text-amber-400"
      : "text-white";

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
        <Link
          to="/olympus/missions"
          className="shrink-0 text-white font-semibold select-none"
          style={{ fontSize: 14, letterSpacing: "0.06em" }}
          aria-label="ATLAS"
        >
          ATLAS
        </Link>
        <span className="hidden sm:inline-block h-5 w-px shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />

        <nav className="hidden md:flex items-center gap-1 shrink-0">
          <Link
            to="/olympus/missions"
            className="px-2.5 py-1 rounded text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
            activeProps={{ className: "px-2.5 py-1 rounded text-[12px] text-white font-medium bg-white/[0.06]" }}
          >
            Missions
          </Link>
          <Link
            to="/admin/team"
            className="px-2.5 py-1 rounded text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
            activeProps={{ className: "px-2.5 py-1 rounded text-[12px] text-white font-medium bg-white/[0.06]" }}
          >
            Team
          </Link>
          <Link
            to="/reports"
            className="px-2.5 py-1 rounded text-[12px] text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
            activeProps={{ className: "px-2.5 py-1 rounded text-[12px] text-white font-medium bg-white/[0.06]" }}
          >
            Reports
          </Link>
        </nav>

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

        {/* CENTER — mission chips */}
        {missionId && ctx && (
          <div className="hidden lg:flex items-center gap-2 min-w-0 overflow-hidden ml-2">
            <StatusChip status={ctx.status} />
            {days !== null && (
              <span
                className={cn("text-[12px] font-medium", dayColor)}
                title="Days to submission"
              >
                {days < 0 ? `${Math.abs(days)}d past` : `${days}d`}
              </span>
            )}
            {ctx.intelligence_graph_completeness != null && (
              <span
                className="inline-flex items-center rounded-full px-2 py-[2px] border"
                style={{
                  background: "rgba(196,154,43,0.15)",
                  borderColor: "rgba(196,154,43,0.35)",
                  color: "#C49A2B",
                  fontSize: 11,
                }}
              >
                Intel: {Math.round(ctx.intelligence_graph_completeness)}%
              </span>
            )}
            {ctx.at_risk > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-[2px]"
                style={{ background: "rgba(224,74,74,0.12)", color: "#f08080", fontSize: 11 }}
              >
                <AlertTriangle className="h-3 w-3" /> {ctx.at_risk} at risk
              </span>
            )}
          </div>
        )}

        {/* RIGHT */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {missionId && (
            <Link
              to="/olympus/flight-deck"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md"
              style={{
                background: "rgba(196,154,43,0.12)",
                border: "1px solid rgba(196,154,43,0.35)",
                color: "#C49A2B",
                fontSize: 11,
                padding: "4px 10px",
              }}
            >
              <Plane className="h-3 w-3" />
              Flight Deck
            </Link>
          )}
          <div className="relative">
            <button
              ref={jumpBtnRef}
              onClick={() => setJumpOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.6)",
                fontSize: 11,
                padding: "4px 10px",
              }}
            >
              <Command className="h-3 w-3" /> Jump
            </button>
            <QuickJump
              open={jumpOpen}
              onClose={() => setJumpOpen(false)}
              anchorRef={jumpBtnRef}
              currentMissionId={missionId}
            />
          </div>
          {isAdmin && (
            <Link
              to="/admin/team"
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border border-[var(--athena-gold)]/40 text-[var(--athena-gold)] hover:bg-[var(--athena-gold)]/10 transition-colors"
            >
              Athena Team
            </Link>
          )}
          <span className="hidden sm:inline-block h-5 w-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          <IntelAlertCount />
          <NotificationBell />
          <UserMenu email={email} />
        </div>
      </div>
    </div>
  );
}
