import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import {
  Target, PencilLine, HelpCircle, Zap, FileText,
  RefreshCw, ClipboardList, Rocket, Settings, Plus,
  CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react";
import {
  getAthenaPlatformStats,
  getAthenaMissions,
  getAthenaIntelFeed,
  getAthenaPlatformHealth,
  resetErroredBriefs,
  type AthenaMissionCard,
} from "@/lib/athena-command.functions";
import { refreshMissionGraph } from "@/lib/intelligence-graph.functions";
import { extractSourceIntelligence } from "@/lib/oracle-extract-source.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const GOLD = "var(--athena-gold)";

// ---- Live clock ----
function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function AthenaCommandPage() {
  return (
    <div className="min-h-screen w-full bg-[#0b0d11] text-foreground">
      <PlatformStatusBar />
      <div className="mx-auto max-w-[1600px] px-6 py-6 space-y-8">
        <MissionGrid />
        <div className="grid grid-cols-1 lg:grid-cols-[65fr_35fr] gap-6">
          <PlatformIntelligenceFeed />
          <PlatformHealthPanel />
        </div>
      </div>
    </div>
  );
}

// =============== STATUS BAR ===============
function PlatformStatusBar() {
  const fn = useServerFn(getAthenaPlatformStats);
  const { data, isLoading } = useQuery({
    queryKey: ["athena-stats"],
    queryFn: () => fn(),
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  const now = useNow(1000);

  const chips: { icon: any; label: string; value: number | undefined }[] = [
    { icon: Target, label: "Active Missions", value: data?.activeMissions },
    { icon: PencilLine, label: "Writers Active Today", value: data?.writersActive24h },
    { icon: HelpCircle, label: "Questions In Flight", value: data?.questionsInFlight },
    { icon: Zap, label: "IRIS Runs (24h)", value: data?.irisRuns24h },
    { icon: FileText, label: "Briefs Generated Today", value: data?.briefsGeneratedToday },
  ];

  return (
    <div
      className="sticky top-0 z-30 w-full backdrop-blur bg-[#0b0d11]/95 border-b"
      style={{ borderColor: "rgba(212,175,55,0.25)" }}
    >
      <div className="mx-auto max-w-[1600px] px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div
            className="text-sm font-semibold tracking-[0.25em] uppercase"
            style={{ color: GOLD }}
          >
            ⚡ Athena Command
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {now.toLocaleString(undefined, {
              weekday: "short", month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit", second: "2-digit",
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-2 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs"
            >
              <c.icon className="h-3.5 w-3.5" style={{ color: GOLD }} />
              <span className="text-muted-foreground">{c.label}:</span>
              <span className="font-semibold text-foreground">
                {isLoading || c.value === undefined ? "—" : c.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============== MISSION GRID ===============
const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "setup", label: "Setup" },
  { key: "pens_down", label: "Pens Down" },
  { key: "submitted", label: "Submitted" },
];

function MissionGrid() {
  const fn = useServerFn(getAthenaMissions);
  const { data, isLoading } = useQuery({
    queryKey: ["athena-missions"],
    queryFn: () => fn(),
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
  });
  const [filter, setFilter] = useState<string>("active");
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    const rows = data ?? [];
    if (filter === "all") return rows;
    return rows.filter((m) => m.status === filter);
  }, [data, filter]);

  return (
    <section>
      <div className="flex items-center justify-between gap-4 mb-3">
        <h2 className="text-2xl font-bold tracking-tight">Active Missions</h2>
        <Button
          onClick={() => navigate({ to: "/olympus/missions/new" })}
          style={{ background: GOLD, color: "#0b0d11" }}
          className="hover:opacity-90 font-semibold"
        >
          <Plus className="h-4 w-4" /> New Mission
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs border transition-colors",
              filter === f.key
                ? "border-[var(--athena-gold)] bg-[var(--athena-gold)]/10 text-foreground"
                : "border-border bg-surface/40 text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((m) => <MissionCard key={m.id} m={m} />)}
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  const navigate = useNavigate();
  return (
    <div className="rounded-xl border border-border bg-surface/40 p-16 text-center">
      <p className="text-foreground text-lg mb-1">No active missions</p>
      <p className="text-sm text-muted-foreground mb-6">
        Create your first mission to get started
      </p>
      <Button
        onClick={() => navigate({ to: "/olympus/missions/new" })}
        style={{ background: GOLD, color: "#0b0d11" }}
        className="font-semibold"
      >
        <Plus className="h-4 w-4" /> New Mission
      </Button>
    </div>
  );
}

function MissionCard({ m }: { m: AthenaMissionCard }) {
  const navigate = useNavigate();
  // Health edge color
  const edge =
    m.atRisk > 0 ? "bg-red-500 animate-pulse"
      : m.watch > 0 ? "bg-amber-500"
        : "bg-emerald-500";

  // Countdown
  const days = m.submissionDeadline
    ? Math.ceil((new Date(m.submissionDeadline).getTime() - Date.now()) / 86400000)
    : null;
  const countdownClass =
    days == null ? "border-border text-muted-foreground"
      : days < 7 ? "border-red-500/60 text-red-400 animate-pulse"
        : days < 14 ? "border-amber-500/60 text-amber-400"
          : days < 30 ? "border-[var(--athena-gold)]/60 text-[var(--athena-gold)]"
            : "border-slate-500/60 text-slate-300";

  const briefedPct = m.questionsTotal ? Math.round((m.questionsBriefed / m.questionsTotal) * 100) : 0;
  const teamPct = m.teamTotal ? Math.round((m.teamActive24h / m.teamTotal) * 100) : 0;
  const total = Math.max(m.healthy + m.watch + m.atRisk, 1);
  const lastActivity = m.lastWriterActivityAt
    ? formatDistanceToNowStrict(new Date(m.lastWriterActivityAt), { addSuffix: true })
    : "no activity";

  return (
    <div className="group relative rounded-xl border border-border bg-surface/40 overflow-hidden hover:border-[var(--athena-gold)]/40 transition-colors">
      <div className={cn("absolute right-0 top-0 bottom-0 w-1", edge)} />
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: GOLD, opacity: 0.7 }} />

      <div className="p-5 pl-6 pr-6">
        {/* Identity */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate" title={m.name}>
              {truncate(m.name, 55)}
            </h3>
            {m.client && (
              <p className="text-xs text-muted-foreground truncate" title={m.client}>
                {truncate(m.client, 60)}
              </p>
            )}
            <div className="flex gap-1.5 mt-2">
              <span className="text-[10px] uppercase tracking-wider rounded-full border border-border bg-background/60 px-2 py-0.5 text-muted-foreground">
                {m.status.replace(/_/g, " ")}
              </span>
              {days != null && (
                <span className={cn("text-[10px] uppercase tracking-wider rounded-full border bg-background/60 px-2 py-0.5", countdownClass)}>
                  {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d to submit`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bars */}
        <div className="space-y-2.5">
          <MiniBar
            label="Questions" right={`${m.questionsBriefed} ready`}
            counts={`${m.questionsBriefed}/${m.questionsTotal}`}
            pct={briefedPct} color="bg-[var(--athena-gold)]"
          />
          <MiniBar
            label="Writers" right={`${m.teamActive24h} active`}
            counts={`${m.teamActive24h}/${m.teamTotal}`}
            pct={teamPct} color="bg-blue-400"
          />
          {/* Health segmented bar */}
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Health</span>
              <span>{m.healthy} healthy · {m.watch} watch · {m.atRisk} at risk</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-surface">
              <div className="bg-emerald-500" style={{ width: `${(m.healthy / total) * 100}%` }} />
              <div className="bg-amber-500" style={{ width: `${(m.watch / total) * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(m.atRisk / total) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[11px] mt-4 pt-3 border-t border-border/60">
          <span className="text-muted-foreground">Last writer activity: {lastActivity}</span>
          {m.needsAttention > 0 && (
            <span className={cn(
              "rounded-full border px-2 py-0.5 font-semibold",
              m.needsAttention > 5
                ? "border-red-500/60 text-red-400 bg-red-500/10"
                : "border-amber-500/60 text-amber-400 bg-amber-500/10",
            )}>
              {m.needsAttention} need attention
            </span>
          )}
        </div>
      </div>

      {/* Hover actions */}
      <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform bg-[#0b0d11]/95 backdrop-blur border-t border-border p-2 flex gap-2 justify-center">
        <Link
          to="/missions/$missionId/briefing"
          params={{ missionId: m.id }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border bg-surface hover:bg-[var(--athena-gold)]/10 hover:border-[var(--athena-gold)]/40"
        >
          <ClipboardList className="h-3.5 w-3.5" /> Briefing
        </Link>
        <Link
          to="/missions/$missionId/war-room"
          params={{ missionId: m.id }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border bg-surface hover:bg-[var(--athena-gold)]/10 hover:border-[var(--athena-gold)]/40"
        >
          <Rocket className="h-3.5 w-3.5" /> War Room
        </Link>
        <button
          onClick={() => navigate({ to: "/olympus/wizard/$missionId", params: { missionId: m.id } })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border bg-surface hover:bg-[var(--athena-gold)]/10 hover:border-[var(--athena-gold)]/40"
        >
          <Settings className="h-3.5 w-3.5" /> Setup
        </button>
      </div>
    </div>
  );
}

function MiniBar({ label, right, counts, pct, color }: {
  label: string; right: string; counts: string; pct: number; color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{right}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
          <div className={cn("h-full", color)} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">{counts}</span>
      </div>
    </div>
  );
}

// =============== INTEL FEED ===============
const INTEL_FILTERS: { key: string; label: string; match: (t: string) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "risk", label: "Risks", match: (t) => /risk|threat/i.test(t) },
  { key: "evidence", label: "Evidence", match: (t) => /evidence|proof|extraction/i.test(t) },
  { key: "competitive", label: "Competitive", match: (t) => /competitive|competitor/i.test(t) },
  { key: "signal", label: "Signals", match: (t) => /signal|update/i.test(t) },
  { key: "opportunity", label: "Opportunities", match: (t) => /opportunity/i.test(t) },
];

function eventColor(t: string) {
  if (/risk|threat/i.test(t)) return "border-l-red-500";
  if (/opportunity|evidence|proof|extraction/i.test(t)) return "border-l-emerald-500";
  if (/competitive|competitor/i.test(t)) return "border-l-amber-500";
  return "border-l-slate-500";
}

function PlatformIntelligenceFeed() {
  const fn = useServerFn(getAthenaIntelFeed);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["athena-intel"],
    queryFn: () => fn(),
    staleTime: 60_000,
  });
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const matcher = INTEL_FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
    return (data ?? []).filter((e) => matcher(e.eventType));
  }, [data, filter]);

  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="font-bold text-lg">Platform Intelligence</h3>
          <p className="text-xs text-muted-foreground">What IRIS is watching across all missions</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 my-3">
        {INTEL_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] border",
              filter === f.key
                ? "border-[var(--athena-gold)] bg-[var(--athena-gold)]/10"
                : "border-border bg-surface/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0,1,2].map(i => <Skeleton key={i} className="h-14 rounded" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          IRIS has been quiet across all missions. Intelligence will surface as missions process documents.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => {
            const isOpen = expanded === e.id;
            const summary = e.summary ?? "";
            const display = isOpen ? summary : summary.length > 90 ? summary.slice(0, 89) + "…" : summary;
            return (
              <li
                key={e.id}
                className={cn(
                  "rounded border border-border bg-surface/60 p-3 border-l-4",
                  eventColor(e.eventType),
                )}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1 text-[11px]">
                  {e.missionId && e.missionName && (
                    <Link
                      to="/missions/$missionId/intelligence"
                      params={{ missionId: e.missionId }}
                      className="rounded-full px-2 py-0.5 font-semibold hover:underline"
                      style={{ background: "rgba(212,175,55,0.15)", color: GOLD }}
                    >
                      {truncate(e.missionName, 20)}
                    </Link>
                  )}
                  <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground uppercase tracking-wide text-[10px]">
                    {e.eventType}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {formatDistanceToNowStrict(new Date(e.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {e.title && <p className="text-sm font-medium mb-0.5">{e.title}</p>}
                {summary && (
                  <button
                    className="text-xs text-muted-foreground text-left"
                    onClick={() => setExpanded(isOpen ? null : e.id)}
                  >
                    {display}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// =============== PLATFORM HEALTH ===============
function PlatformHealthPanel() {
  const fn = useServerFn(getAthenaPlatformHealth);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["athena-health"],
    queryFn: () => fn(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const qc = useQueryClient();
  const resetFn = useServerFn(resetErroredBriefs);
  const refreshGraphFn = useServerFn(refreshMissionGraph);
  const extractFn = useServerFn(extractSourceIntelligence);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshLabel, setRefreshLabel] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  async function handleFix() {
    try {
      const r = await resetFn();
      toast.success(`Fixed ${r.fixed} error${r.fixed === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["athena-health"] });
      qc.invalidateQueries({ queryKey: ["athena-stats"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    }
  }

  async function handleRefreshGraphs() {
    if (!data?.activeMissions?.length) return;
    setRefreshing(true);
    let ok = 0;
    for (const m of data.activeMissions) {
      setRefreshLabel(m.name);
      try {
        await refreshGraphFn({ data: { missionId: m.id } });
        ok++;
      } catch (e: any) {
        console.error("[athena] graph refresh failed", m.id, e);
      }
    }
    setRefreshing(false);
    setRefreshLabel(null);
    toast.success(`Refreshed ${ok} mission${ok === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["athena-health"] });
  }

  async function handleExtractAll() {
    if (!data?.pendingDocuments?.length) return;
    setExtracting(true);
    let ok = 0;
    for (const d of data.pendingDocuments) {
      try {
        await extractFn({ data: { mission_id: d.mission_id, document_id: d.id } });
        ok++;
      } catch (e: any) {
        console.error("[athena] extract failed", d.id, e);
      }
    }
    setExtracting(false);
    toast.success(`Extracted ${ok} document${ok === 1 ? "" : "s"}`);
    qc.invalidateQueries({ queryKey: ["athena-health"] });
  }

  return (
    <section className="rounded-xl border border-border bg-surface/40 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Platform Health</h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* IRIS Pipeline */}
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">IRIS Pipeline</h4>
        {isLoading ? <Skeleton className="h-16 rounded" /> : (
          <div className="space-y-1.5">
            {(data?.cronJobs ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No Athena cron jobs registered.</p>
            )}
            {(data?.cronJobs ?? []).map((j) => {
              const last = j.lastRunAt ? new Date(j.lastRunAt) : null;
              const ageHrs = last ? (Date.now() - last.getTime()) / 3600000 : Infinity;
              const ok = ageHrs < 25;
              return (
                <div key={j.jobname} className="flex items-center justify-between text-xs border border-border rounded bg-background/40 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{j.jobname}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{j.schedule}</div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className="text-[10px] text-muted-foreground">
                      {last ? formatDistanceToNowStrict(last, { addSuffix: true }) : "never"}
                    </div>
                    <div className="flex justify-end">
                      {ok
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Brief Generation */}
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Brief Generation</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Ready" value={data?.briefs.ready} />
          <Stat label="Queued" value={data?.briefs.queued} />
          <Stat label="Generating" value={data?.briefs.generating} />
          <Stat label="Errors" value={data?.briefs.errors} danger={!!data?.briefs.errors} />
        </div>
        {!!data?.briefs.errors && (
          <button
            onClick={handleFix}
            className="mt-2 text-xs text-red-400 hover:underline inline-flex items-center gap-1"
          >
            <XCircle className="h-3 w-3" /> Fix → reset {data.briefs.errors} to pending
          </button>
        )}
      </div>

      {/* Graph Intelligence */}
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Graph Intelligence</h4>
        <div className="grid grid-cols-2 gap-2 text-xs mb-2">
          <Stat label="Total Nodes" value={data?.graph.nodes} />
          <Stat label="Total Edges" value={data?.graph.edges} />
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Last refresh: {data?.graph.lastRefreshAt
            ? formatDistanceToNowStrict(new Date(data.graph.lastRefreshAt), { addSuffix: true })
            : "never"}
        </p>
        <Button
          variant="outline" size="sm" disabled={refreshing}
          onClick={handleRefreshGraphs} className="w-full text-xs"
        >
          {refreshing
            ? <>Refreshing {refreshLabel ? truncate(refreshLabel, 22) : "…"}</>
            : <>Refresh All Graphs →</>}
        </Button>
      </div>

      {/* Source Ingestion */}
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Source Ingestion</h4>
        <div className="grid grid-cols-2 gap-2 text-xs mb-2">
          <Stat label="Sources Uploaded" value={data?.sources.uploaded} />
          <Stat label="Pending Extraction" value={data?.sources.pendingExtraction} danger={!!data?.sources.pendingExtraction} />
        </div>
        {!!data?.sources.pendingExtraction && (
          <Button
            variant="outline" size="sm" disabled={extracting}
            onClick={handleExtractAll} className="w-full text-xs"
          >
            {extracting ? "Extracting…" : `Run Extraction → ${data.sources.pendingExtraction}`}
          </Button>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, danger }: { label: string; value: number | undefined; danger?: boolean }) {
  return (
    <div className={cn(
      "rounded border px-2.5 py-2",
      danger ? "border-red-500/40 bg-red-500/10" : "border-border bg-background/40",
    )}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", danger && "text-red-400")}>
        {value ?? "—"}
      </div>
    </div>
  );
}
