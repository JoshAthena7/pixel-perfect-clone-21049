import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow, format, differenceInCalendarDays } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useIris } from "@/components/iris/IrisContext";
import type { TabId } from "./MissionTabs";

const GOLD = "#C49A2B";
const GOLD_DIM = "rgba(196,154,43,0.5)";
const DIVIDER = "rgba(255,255,255,0.06)";
const SURFACE = "rgba(255,255,255,0.03)";
const SURFACE_BORDER = "rgba(255,255,255,0.07)";

/**
 * Mission Briefing Room.
 *
 * The first page a consultant sees when they enter a mission.
 * Top-to-bottom reading order:
 *   1. TODAY      — Daily Insight + Intelligence Pulse
 *   2. THE MISSION — North Star, Evaluators, Competitors, Watch List
 *   3. MY WORK    — Needs Attention + Assignments table
 *
 * The route, navigation, and tab id ("overview") are unchanged — only
 * the contents of this component are rebuilt.
 */
export function OverviewTab({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const iris = useIris();
  useEffect(() => {
    iris.setSection(null, "Mission Briefing Room");
  }, [iris, missionId]);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: 900 }}>
      <PageHeader missionId={missionId} onNavigateTab={onNavigateTab} />
      <SectionDivider label="TODAY" />
      <TodaySection missionId={missionId} onNavigateTab={onNavigateTab} />
      <SectionDivider label="THE MISSION" />
      <TheMissionSection missionId={missionId} onNavigateTab={onNavigateTab} />
      <SectionDivider label="MY WORK" />
      <MyWorkSection missionId={missionId} />
    </div>
  );
}

/* --------------------------- Page Header --------------------------- */

function PageHeader({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const { data: mission } = useQuery({
    queryKey: ["briefing-header", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("name, client_name, program_type")
        .eq("id", missionId)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="pt-2 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          className="truncate min-w-0"
          style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}
        >
          {mission
            ? [mission.name, mission.client_name, mission.program_type]
                .filter(Boolean)
                .join(" · ")
            : "Loading…"}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/olympus/flight-deck"
            className="inline-flex items-center gap-1 rounded-md transition-colors"
            style={{
              background: "rgba(196,154,43,0.15)",
              border: "1px solid rgba(196,154,43,0.4)",
              color: GOLD,
              fontSize: 13,
              padding: "6px 16px",
              fontWeight: 500,
            }}
          >
            Enter Flight Deck <ArrowRight size={13} />
          </Link>
          <button
            onClick={() => onNavigateTab("oracle")}
            className="inline-flex items-center gap-1 rounded-md transition-colors hover:bg-white/[0.08]"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
              fontSize: 13,
              padding: "6px 16px",
              fontWeight: 500,
            }}
          >
            View Oracle <ArrowRight size={13} />
          </button>
        </div>
      </div>
      <div
        className="mt-5"
        style={{
          height: 1,
          background: "rgba(196,154,43,0.3)",
        }}
      />
    </div>
  );
}

/* --------------------------- Section Divider --------------------------- */

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="relative my-8 flex items-center">
      <div className="flex-1" style={{ height: 1, background: DIVIDER }} />
      <span
        className="mx-4 uppercase"
        style={{
          color: GOLD,
          fontSize: 11,
          letterSpacing: "0.18em",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <div className="flex-1" style={{ height: 1, background: DIVIDER }} />
    </div>
  );
}

/* =========================================================================
 * SECTION 1 — TODAY
 * ========================================================================= */

function TodaySection({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <DailyInsightCard missionId={missionId} />
      </div>
      <div className="lg:col-span-2 space-y-2.5">
        <div
          className="uppercase"
          style={{
            color: GOLD,
            fontSize: 11,
            letterSpacing: "0.18em",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Intelligence Pulse
        </div>
        <NewSinceYesterdayCard missionId={missionId} onNavigateTab={onNavigateTab} />
        <MonitoringStatusCard missionId={missionId} />
        <OracleHealthCard missionId={missionId} />
      </div>
    </div>
  );
}

function DailyInsightCard({ missionId }: { missionId: string }) {
  // The athena_insights table and AthenaInsightCard component do not yet exist.
  // We always render the empty-state placeholder. Admins see a CTA; non-admins
  // see nothing in this slot.
  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) return false;
      const { data } = await supabase.rpc("has_role", {
        _user_id: u.user.id,
        _role: "admin",
      });
      return !!data;
    },
  });

  if (isAdmin === undefined) {
    return <Skeleton className="h-44 w-full" />;
  }

  if (!isAdmin) return <div className="hidden" aria-hidden />;

  return (
    <div>
      <div
        className="uppercase"
        style={{
          color: GOLD,
          fontSize: 10,
          letterSpacing: "0.24em",
          fontWeight: 600,
          marginBottom: 8,
        }}
      >
        ✦ Today's Athena Insight
      </div>
      <div
        className="rounded-lg p-5"
        style={{
          borderLeft: `3px solid ${GOLD}`,
          background: "rgba(196,154,43,0.04)",
          border: "1px solid rgba(196,154,43,0.15)",
          borderLeftWidth: 3,
        }}
      >
        <div
          className="flex items-start gap-3"
          style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}
        >
          <Sparkles size={16} style={{ color: GOLD, marginTop: 2 }} />
          <div className="flex-1">
            <p>No Daily Insight set for today.</p>
            <p
              className="mt-1"
              style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}
            >
              The Daily Insight surface is reserved for an upcoming Athena
              Insights feature.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PulseCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg"
      style={{
        background: SURFACE,
        border: `1px solid ${SURFACE_BORDER}`,
        padding: 12,
      }}
    >
      {children}
    </div>
  );
}

function NewSinceYesterdayCard({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-new-intel", missionId],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, count } = await supabase
        .from("intelligence_feed_items")
        .select("id, headline, source_name", { count: "exact" })
        .eq("mission_id", missionId)
        .gte("iris_relevance_score", 60)
        .gte("created_at", since)
        .order("iris_relevance_score", { ascending: false })
        .limit(1);
      return { count: count ?? 0, top: (data ?? [])[0] ?? null };
    },
  });

  if (isLoading) return <PulseCard><Skeleton className="h-14 w-full" /></PulseCard>;

  return (
    <PulseCard>
      {data && data.count > 0 ? (
        <>
          <div className="flex items-baseline gap-2">
            <span style={{ color: GOLD, fontSize: 18, fontWeight: 600 }}>
              {data.count}
            </span>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
              new intelligence items
            </span>
          </div>
          {data.top && (
            <div className="mt-1.5">
              <div className="text-white truncate" style={{ fontSize: 13 }}>
                {data.top.headline}
              </div>
              {data.top.source_name && (
                <div
                  className="truncate"
                  style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}
                >
                  {data.top.source_name}
                </div>
              )}
            </div>
          )}
          <button
            onClick={() => onNavigateTab("oracle")}
            className="mt-2 inline-flex items-center gap-1"
            style={{ color: GOLD, fontSize: 12 }}
          >
            View in Oracle <ArrowRight size={12} />
          </button>
        </>
      ) : (
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
          No new intelligence since yesterday.
        </div>
      )}
    </PulseCard>
  );
}

function MonitoringStatusCard({ missionId }: { missionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-monitoring", missionId],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("intelligence_feed_configs")
        .select("id, last_checked_at", { count: "exact" })
        .eq("mission_id", missionId)
        .eq("is_active", true)
        .order("last_checked_at", { ascending: false, nullsFirst: false })
        .limit(1);
      return { count: count ?? 0, lastChecked: data?.[0]?.last_checked_at ?? null };
    },
  });

  if (isLoading) return <PulseCard><Skeleton className="h-14 w-full" /></PulseCard>;

  if (!data || data.count === 0) {
    return (
      <PulseCard>
        <div
          className="flex items-start gap-2"
          style={{ color: "#fbbf24", fontSize: 13 }}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>No monitoring feeds active. Set up feeds in Intelligence Loadout.</span>
        </div>
      </PulseCard>
    );
  }

  return (
    <PulseCard>
      <div className="text-white" style={{ fontSize: 14, fontWeight: 500 }}>
        {data.count} feed{data.count === 1 ? "" : "s"} active
      </div>
      <div
        className="mt-0.5"
        style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}
      >
        {data.lastChecked
          ? `Last checked ${formatDistanceToNow(new Date(data.lastChecked), { addSuffix: true })}`
          : "No checks recorded yet"}
      </div>
    </PulseCard>
  );
}

function OracleHealthCard({ missionId }: { missionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-oracle-health", missionId],
    queryFn: async () => {
      const [mission, nodes, items, competitors] = await Promise.all([
        supabase
          .from("missions")
          .select("intelligence_graph_completeness")
          .eq("id", missionId)
          .maybeSingle(),
        supabase
          .from("intelligence_graph_nodes")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
        supabase
          .from("intelligence_feed_items")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
        supabase
          .from("competitor_profiles")
          .select("id", { count: "exact", head: true })
          .eq("mission_id", missionId),
      ]);
      return {
        pct: Math.max(
          0,
          Math.min(100, mission.data?.intelligence_graph_completeness ?? 0),
        ),
        nodes: nodes.count ?? 0,
        items: items.count ?? 0,
        competitors: competitors.count ?? 0,
      };
    },
  });

  if (isLoading || !data) return <PulseCard><Skeleton className="h-16 w-full" /></PulseCard>;

  const color =
    data.pct >= 90 ? GOLD : data.pct >= 70 ? "#34d399" : data.pct >= 40 ? "#fbbf24" : "#f87171";

  return (
    <PulseCard>
      <div className="flex items-baseline justify-between">
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
          Intelligence Graph
        </span>
        <span style={{ color, fontSize: 13, fontWeight: 600 }}>{data.pct}%</span>
      </div>
      <div
        className="mt-1.5 rounded-full overflow-hidden"
        style={{ height: 6, background: "rgba(255,255,255,0.08)" }}
      >
        <div
          style={{
            height: "100%",
            width: `${data.pct}%`,
            background: color,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <div
        className="mt-1.5"
        style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}
      >
        {data.nodes} nodes · {data.items} feed items · {data.competitors} competitors profiled
      </div>
    </PulseCard>
  );
}

/* =========================================================================
 * SECTION 2 — THE MISSION
 * ========================================================================= */

function TheMissionSection({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  return (
    <div className="space-y-5">
      <NorthStarBlock missionId={missionId} onNavigateTab={onNavigateTab} />
      <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
        <EvaluatorsBlock missionId={missionId} onNavigateTab={onNavigateTab} />
        <CompetitorsBlock missionId={missionId} onNavigateTab={onNavigateTab} />
      </div>
      <WatchListBlock missionId={missionId} onNavigateTab={onNavigateTab} />
    </div>
  );
}

function NorthStarBlock({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-win-strategy", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_win_strategy")
        .select("north_star_message, central_claim, win_themes")
        .eq("mission_id", missionId)
        .maybeSingle();
      return data;
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const themes: string[] = Array.isArray((data as any)?.win_themes)
    ? ((data as any).win_themes as any[]).map((t) =>
        typeof t === "string" ? t : (t?.title ?? t?.name ?? t?.theme ?? ""),
      ).filter(Boolean)
    : [];

  return (
    <div
      className="rounded-lg"
      style={{
        background: "rgba(196,154,43,0.04)",
        border: "1px solid rgba(196,154,43,0.15)",
        borderTop: `2px solid ${GOLD}`,
        padding: "20px 24px",
      }}
    >
      <div
        className="uppercase"
        style={{
          color: GOLD,
          fontSize: 10,
          letterSpacing: "0.24em",
          fontWeight: 600,
        }}
      >
        North Star
      </div>
      {data?.north_star_message ? (
        <>
          <p
            className="mt-3 text-white"
            style={{ fontSize: 20, lineHeight: 1.5, fontStyle: "italic" }}
          >
            {data.north_star_message}
          </p>
          {data.central_claim && (
            <p className="mt-3" style={{ fontSize: 14 }}>
              <span style={{ color: GOLD, fontSize: 12, fontWeight: 600 }}>
                Central Claim:{" "}
              </span>
              <span style={{ color: "rgba(255,255,255,0.7)" }}>
                {data.central_claim}
              </span>
            </p>
          )}
          {themes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {themes.map((t, i) => (
                <span
                  key={i}
                  style={{
                    background: "rgba(196,154,43,0.1)",
                    border: "1px solid rgba(196,154,43,0.25)",
                    color: GOLD,
                    fontSize: 12,
                    padding: "3px 10px",
                    borderRadius: 20,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
          Win Strategy not yet set. Complete mission setup to add the North Star.{" "}
          <button
            onClick={() => onNavigateTab("win-strategy")}
            style={{ color: GOLD }}
            className="hover:underline"
          >
            Open Win Strategy →
          </button>
        </div>
      )}
    </div>
  );
}

function EvaluatorsBlock({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-evaluators", missionId],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("stakeholder_profiles")
        .select("id, name, title, organization, stakeholder_type, public_priorities", {
          count: "exact",
        })
        .eq("mission_id", missionId)
        .in("stakeholder_type", ["evaluator", "influencer"])
        .order("stakeholder_type")
        .limit(4);
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  return (
    <div>
      <SubLabel>Key Evaluators</SubLabel>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.rows.length === 0 ? (
        <MutedEmpty>
          No evaluator profiles yet.{" "}
          <button
            onClick={() => onNavigateTab("oracle")}
            style={{ color: GOLD }}
            className="hover:underline"
          >
            Add in Oracle →
          </button>
        </MutedEmpty>
      ) : (
        <>
          <ul className="space-y-2.5 mt-2">
            {data.rows.map((p: any) => {
              const isEval = p.stakeholder_type === "evaluator";
              return (
                <li key={p.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 shrink-0 rounded-full"
                    style={{
                      width: 6,
                      height: 6,
                      background: isEval ? GOLD : "#94a3b8",
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-white" style={{ fontSize: 13, fontWeight: 500 }}>
                      {p.name}
                    </div>
                    {(p.title || p.organization) && (
                      <div
                        style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}
                        className="truncate"
                      >
                        {[p.title, p.organization].filter(Boolean).join(" · ")}
                      </div>
                    )}
                    {p.public_priorities && (
                      <div
                        className="truncate"
                        style={{
                          color: "rgba(255,255,255,0.5)",
                          fontSize: 12,
                          fontStyle: "italic",
                        }}
                      >
                        {truncate(p.public_priorities, 80)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {data.total > 4 && (
            <button
              onClick={() => onNavigateTab("oracle")}
              className="mt-3 inline-flex items-center gap-1"
              style={{ color: GOLD, fontSize: 12 }}
            >
              {data.total - 4} more evaluators <ArrowRight size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CompetitorsBlock({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-competitors", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("competitor_profiles")
        .select("id, organization_name, competitor_type, likely_narrative")
        .eq("mission_id", missionId)
        .limit(3);
      return data ?? [];
    },
  });

  return (
    <div>
      <SubLabel>Competitive Landscape</SubLabel>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : !data || data.length === 0 ? (
        <MutedEmpty>
          No competitors identified yet.{" "}
          <button
            onClick={() => onNavigateTab("oracle")}
            style={{ color: GOLD }}
            className="hover:underline"
          >
            Add in Oracle →
          </button>
        </MutedEmpty>
      ) : (
        <ul className="space-y-2.5 mt-2">
          {data.map((c: any) => {
            const t = (c.competitor_type ?? "").toLowerCase();
            const badge =
              t === "incumbent"
                ? { label: "Incumbent", bg: "rgba(224,74,74,0.15)", color: "#fca5a5" }
                : t === "likely" || t === "likely_bidder"
                ? { label: "Likely Bidder", bg: "rgba(251,191,36,0.15)", color: "#fbbf24" }
                : { label: "Possible", bg: "rgba(148,163,184,0.15)", color: "#cbd5e1" };
            return (
              <li key={c.id}>
                <div className="flex items-center gap-2">
                  <span
                    className="uppercase rounded"
                    style={{
                      background: badge.bg,
                      color: badge.color,
                      fontSize: 9,
                      letterSpacing: "0.1em",
                      padding: "2px 6px",
                      fontWeight: 600,
                    }}
                  >
                    {badge.label}
                  </span>
                  <span className="text-white truncate" style={{ fontSize: 13 }}>
                    {c.organization_name}
                  </span>
                </div>
                {c.likely_narrative && (
                  <div
                    className="mt-0.5 truncate"
                    style={{
                      color: "rgba(255,255,255,0.5)",
                      fontSize: 12,
                      fontStyle: "italic",
                      paddingLeft: 4,
                    }}
                  >
                    {truncate(c.likely_narrative, 80)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function WatchListBlock({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing-watchlist", missionId],
    queryFn: async () => {
      const [risks, atRisk] = await Promise.all([
        supabase
          .from("intelligence_graph_nodes")
          .select("id, label, description, created_at")
          .eq("mission_id", missionId)
          .eq("node_type", "risk")
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("mission_questions")
          .select("id, question_number")
          .eq("mission_id", missionId)
          .eq("health_status", "at_risk")
          .eq("is_withdrawn", false),
      ]);
      return {
        risks: risks.data ?? [],
        atRiskQs: atRisk.data ?? [],
      };
    },
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  const empty = !data || (data.risks.length === 0 && data.atRiskQs.length === 0);

  return (
    <div
      className="rounded-lg"
      style={{
        background: empty ? "rgba(52,211,153,0.03)" : "rgba(224,74,74,0.03)",
        border: `1px solid ${empty ? "rgba(52,211,153,0.15)" : "rgba(224,74,74,0.12)"}`,
        padding: "16px 20px",
      }}
    >
      <div
        className="uppercase"
        style={{
          color: empty ? "rgba(52,211,153,0.7)" : "rgba(224,74,74,0.7)",
          fontSize: 11,
          letterSpacing: "0.18em",
          fontWeight: 600,
        }}
      >
        Watch List
      </div>

      {empty ? (
        <div
          className="mt-2 flex items-center gap-2"
          style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}
        >
          <CheckCircle2 size={14} style={{ color: "#34d399" }} />
          No active risks identified. Mission is healthy.
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          {data!.atRiskQs.length > 0 && (
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#f87171" }} />
              <div className="flex-1 min-w-0">
                <div className="text-white" style={{ fontSize: 13 }}>
                  {data!.atRiskQs.length} question
                  {data!.atRiskQs.length === 1 ? " is" : "s are"} At Risk
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {data!.atRiskQs.slice(0, 8).map((q: any) => (
                    <span
                      key={q.id}
                      className="rounded"
                      style={{
                        background: "rgba(224,74,74,0.1)",
                        color: "#fca5a5",
                        fontSize: 11,
                        padding: "1px 6px",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {q.question_number}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => onNavigateTab("question-health")}
                  className="mt-1 inline-flex items-center gap-1"
                  style={{ color: GOLD, fontSize: 12 }}
                >
                  View in Question Health <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
          {data!.risks.map((r: any) => (
            <div key={r.id} className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "#fbbf24" }} />
              <div className="min-w-0">
                <div className="text-white" style={{ fontSize: 13 }}>
                  {r.label}
                </div>
                {r.description && (
                  <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
                    {truncate(r.description, 100)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
 * SECTION 3 — MY WORK
 * ========================================================================= */

function MyWorkSection({ missionId }: { missionId: string }) {
  const { data: memberId, isLoading: loadingMember } = useQuery({
    queryKey: ["current-atlas-member-id"],
    queryFn: async () => {
      const { data } = await supabase.rpc("current_atlas_member_id");
      return (data as string) ?? null;
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["briefing-my-work", missionId, memberId],
    enabled: !!memberId,
    queryFn: async () => {
      const { data: asgs } = await supabase
        .from("mission_assignments")
        .select("id, question_id, acceptance_status, due_date, writer_confidence")
        .eq("mission_id", missionId)
        .eq("assigned_writer_id", memberId!);
      const list = asgs ?? [];
      const qIds = list.map((a: any) => a.question_id).filter(Boolean);
      const [qRes, sRes] = await Promise.all([
        qIds.length
          ? supabase
              .from("mission_questions")
              .select("id, question_number, section_id, health_status, due_date")
              .in("id", qIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("mission_sections")
          .select("id, name")
          .eq("mission_id", missionId),
      ]);
      const qMap = new Map<string, any>((qRes.data ?? []).map((q: any) => [q.id, q]));
      const sMap = new Map<string, string>(
        (sRes.data ?? []).map((s: any) => [s.id, s.name]),
      );
      return list.map((a: any) => {
        const q = qMap.get(a.question_id);
        return {
          assignmentId: a.id,
          questionId: a.question_id,
          questionNumber: q?.question_number ?? "—",
          sectionName: q ? sMap.get(q.section_id) ?? "—" : "—",
          health: q?.health_status ?? null,
          dueDate: a.due_date ?? q?.due_date ?? null,
          confidence: a.writer_confidence ?? null,
          acceptance: a.acceptance_status ?? null,
        };
      });
    },
  });

  if (loadingMember || isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!memberId || !data || data.length === 0) {
    return (
      <div className="text-center py-6">
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>
          No assignments yet. Your Engagement Lead will assign questions to you.
        </div>
        <div
          className="mt-2"
          style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, fontStyle: "italic" }}
        >
          While you wait — read the North Star above and review the Intelligence Graph in Oracle.
        </div>
      </div>
    );
  }

  const now = Date.now();
  const pending = data.filter((a) => a.acceptance === "pending");
  const atRisk = data.filter((a) => a.health === "at_risk");
  const dueSoon = data.filter((a) => {
    if (!a.dueDate || a.health === "at_risk") return false;
    const d = new Date(a.dueDate).getTime();
    const days = Math.ceil((d - now) / (24 * 3600 * 1000));
    return days >= 0 && days < 7;
  });
  const hasAttention = pending.length > 0 || atRisk.length > 0 || dueSoon.length > 0;

  return (
    <div className="space-y-6">
      {hasAttention && (
        <div>
          <SubLabel color="#f87171">Needs Attention</SubLabel>
          <div className="mt-2 space-y-2">
            {pending.length > 0 && (
              <div
                className="rounded-md flex items-center justify-between gap-3"
                style={{
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.3)",
                  padding: "10px 14px",
                }}
              >
                <div className="text-white" style={{ fontSize: 13 }}>
                  You have {pending.length} unaccepted assignment
                  {pending.length === 1 ? "" : "s"}. Accept them in the Flight Deck.
                </div>
                <Link
                  to="/olympus/flight-deck"
                  className="inline-flex items-center gap-1 shrink-0"
                  style={{ color: GOLD, fontSize: 12 }}
                >
                  Go to Flight Deck <ArrowRight size={12} />
                </Link>
              </div>
            )}
            {atRisk.map((a) => (
              <AttentionRow
                key={a.assignmentId}
                color="#f87171"
                bg="rgba(224,74,74,0.05)"
                border="rgba(224,74,74,0.25)"
                row={a}
              />
            ))}
            {dueSoon.map((a) => (
              <AttentionRow
                key={a.assignmentId}
                color="#fbbf24"
                bg="rgba(251,191,36,0.05)"
                border="rgba(251,191,36,0.25)"
                row={a}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <SubLabel>My Assignments</SubLabel>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <Th>Q#</Th>
                <Th>Section</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th>Confidence</Th>
                <Th align="right">Action</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr
                  key={row.assignmentId}
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                >
                  <Td>
                    <span style={{ color: GOLD, fontSize: 12, fontFamily: "ui-monospace, monospace" }}>
                      {row.questionNumber}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-white">{row.sectionName}</span>
                  </Td>
                  <Td>
                    <HealthBadge value={row.health} />
                  </Td>
                  <Td>
                    <DueDate value={row.dueDate} />
                  </Td>
                  <Td>
                    <ConfidenceBadge value={row.confidence} />
                  </Td>
                  <Td align="right">
                    <Link
                      to="/olympus/flight-deck"
                      style={{ color: GOLD, fontSize: 12 }}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Open <ArrowRight size={12} />
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pt-2">
        <Link
          to="/olympus/flight-deck"
          className="inline-flex items-center justify-center gap-2 rounded-md w-full sm:w-auto"
          style={{
            background: "rgba(196,154,43,0.15)",
            border: `1px solid ${GOLD}`,
            color: GOLD,
            fontSize: 14,
            padding: "10px 24px",
            fontWeight: 600,
          }}
        >
          Enter Flight Deck <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

/* --------------------------- Small helpers --------------------------- */

function SubLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      className="uppercase"
      style={{
        color: color ?? "rgba(255,255,255,0.4)",
        fontSize: 11,
        letterSpacing: "0.18em",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function MutedEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
      {children}
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className="font-medium"
      style={{ textAlign: align ?? "left", padding: "8px 8px" }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <td style={{ textAlign: align ?? "left", padding: "10px 8px" }}>{children}</td>
  );
}

function HealthBadge({ value }: { value: string | null }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    healthy: { label: "Healthy", bg: "rgba(52,211,153,0.12)", color: "#34d399" },
    watch: { label: "Watch", bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
    at_risk: { label: "At Risk", bg: "rgba(224,74,74,0.12)", color: "#fca5a5" },
  };
  const v = value && map[value] ? map[value] : { label: "Not Started", bg: "rgba(148,163,184,0.12)", color: "#cbd5e1" };
  return (
    <span
      className="uppercase rounded"
      style={{
        background: v.bg,
        color: v.color,
        fontSize: 10,
        letterSpacing: "0.08em",
        padding: "2px 8px",
        fontWeight: 600,
      }}
    >
      {v.label}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: string | null }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    high: { label: "High", bg: "rgba(52,211,153,0.12)", color: "#34d399" },
    medium: { label: "Medium", bg: "rgba(251,191,36,0.12)", color: "#fbbf24" },
    low: { label: "Low", bg: "rgba(224,74,74,0.12)", color: "#fca5a5" },
  };
  const key = (value ?? "").toLowerCase();
  const v = map[key] ?? { label: "Not Set", bg: "rgba(148,163,184,0.12)", color: "#cbd5e1" };
  return (
    <span
      className="uppercase rounded"
      style={{
        background: v.bg,
        color: v.color,
        fontSize: 10,
        letterSpacing: "0.08em",
        padding: "2px 8px",
        fontWeight: 600,
      }}
    >
      {v.label}
    </span>
  );
}

function DueDate({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: "rgba(255,255,255,0.4)" }}>—</span>;
  const d = new Date(value);
  const days = differenceInCalendarDays(d, new Date());
  const color = days < 0 ? "#f87171" : days < 7 ? "#fbbf24" : "rgba(255,255,255,0.75)";
  return <span style={{ color }}>{format(d, "MMM d")}</span>;
}

function AttentionRow({
  row,
  color,
  bg,
  border,
}: {
  row: {
    questionNumber: string;
    sectionName: string;
    dueDate: string | null;
  };
  color: string;
  bg: string;
  border: string;
}) {
  const days = row.dueDate
    ? differenceInCalendarDays(new Date(row.dueDate), new Date())
    : null;
  return (
    <div
      className="rounded-md flex items-center gap-3"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        padding: "8px 14px",
      }}
    >
      <span
        style={{
          color: GOLD,
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
          minWidth: 40,
        }}
      >
        {row.questionNumber}
      </span>
      <span className="text-white truncate flex-1" style={{ fontSize: 13 }}>
        {row.sectionName}
      </span>
      {row.dueDate && (
        <span style={{ color, fontSize: 12 }}>
          {format(new Date(row.dueDate), "MMM d")}
          {days !== null && ` · ${days}d`}
        </span>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";
}
