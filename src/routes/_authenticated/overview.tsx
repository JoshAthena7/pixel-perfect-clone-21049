import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useEngagement } from "@/hooks/use-engagement";
import { supabase } from "@/integrations/supabase/client";
import athenaLogo from "@/assets/athena-logo-dark.png";
import {
  AlertTriangle,
  Siren,
  ShieldAlert,
  Thermometer,
  Calendar,
  LogOut,
  Users,
  Briefcase,
  
  TrendingUp,
  ArrowRight,
  Radio,
} from "lucide-react";
import { HookFailuresPanel } from "@/components/HookFailuresPanel";

export const Route = createFileRoute("/_authenticated/overview")({
  head: () => ({ meta: [{ title: "Command Dashboard — Athena" }] }),
  component: OverviewPage,
});

type SectionRow = { engagement_id: string; status: string | null };
type Rollup = {
  health: string | null;
  temperature_score: number | null;
  client_sentiment: string | null;
  open_sos: number;
  open_risks: number;
  sections: { green: number; yellow: number; red: number; gray: number; total: number };
};

type CriticalAlert = {
  id: string;
  engagement_id: string;
  engagement_name: string;
  kind: "SOS" | "Risk";
  title: string;
  severity: string | null;
  created_at: string;
};

type MarketItem = {
  id: string;
  source: string;
  title: string;
  summary: string | null;
  url: string | null;
  published_at: string | null;
};

const HEALTH_COLORS: Record<string, string> = {
  Green: "border-emerald-500/60 bg-emerald-500/10 text-emerald-300",
  Yellow: "border-amber-500/60 bg-amber-500/10 text-amber-300",
  Red: "border-red-500/60 bg-red-500/10 text-red-300",
};

const SENTIMENT_COLOR: Record<string, string> = {
  Hot: "text-red-300",
  Warm: "text-amber-300",
  Cool: "text-sky-300",
  Cold: "text-slate-400",
};

function daysColor(days: number | null): string {
  if (days === null) return "text-muted-foreground";
  if (days <= 7) return "text-red-300 font-bold";
  if (days <= 21) return "text-amber-300 font-semibold";
  return "text-emerald-300";
}


function OverviewPage() {
  const { memberships, loading, switchEngagement } = useEngagement();
  const navigate = useNavigate();
  const [rollups, setRollups] = useState<Record<string, Rollup>>({});
  const [criticalAlerts, setCriticalAlerts] = useState<CriticalAlert[]>([]);
  const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
  const [collectiveCount, setCollectiveCount] = useState(0);
  const [fetching, setFetching] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const leadership = useMemo(
    () =>
      memberships.filter(
        (m) => m.role === "founder" || m.role === "pm" || m.role === "engagement_lead"
      ),
    [memberships]
  );

  const engagementIds = useMemo(() => leadership.map((m) => m.engagement.id), [leadership]);
  const engagementIdsKey = engagementIds.join(",");

  useEffect(() => {
    if (loading) return;
    const hasFounderOrPm = memberships.some((m) => m.role === "founder" || m.role === "pm");
    if (!hasFounderOrPm) {
      navigate({ to: "/select-engagement", replace: true });
    }
  }, [loading, memberships, navigate]);

  const refresh = useCallback(async () => {
    if (engagementIds.length === 0) return;
    setFetching(true);
    const ids = engagementIds;
    const [snapRes, sosRes, risksRes, sectionsRes, collectiveRes, marketRes] = await Promise.all([
      supabase
        .from("snapshots")
        .select("engagement_id, health, temperature_score, client_sentiment, snapshot_date")
        .in("engagement_id", ids)
        .order("snapshot_date", { ascending: false }),
      supabase
        .from("sos_alerts")
        .select("id, engagement_id, category, severity, description, created_at, status")
        .in("engagement_id", ids)
        .neq("status", "Resolved"),
      supabase
        .from("risks")
        .select("id, engagement_id, title, severity, status, created_at")
        .in("engagement_id", ids)
        .eq("status", "Open"),
      supabase
        .from("heatmap_sections")
        .select("engagement_id, status")
        .in("engagement_id", ids),
      supabase
        .from("engagement_members")
        .select("user_id")
        .not("user_id", "is", null),
      supabase
        .from("market_intelligence")
        .select("id, source, title, summary, url, published_at")
        .order("ingested_at", { ascending: false })
        .limit(8),
    ]);

    // Rollups
    const map: Record<string, Rollup> = {};
    for (const id of ids) {
      map[id] = {
        health: null,
        temperature_score: null,
        client_sentiment: null,
        open_sos: 0,
        open_risks: 0,
        sections: { green: 0, yellow: 0, red: 0, gray: 0, total: 0 },
      };
    }
    for (const s of (snapRes.data ?? []) as any[]) {
      if (map[s.engagement_id] && map[s.engagement_id].health === null) {
        map[s.engagement_id].health = s.health;
        map[s.engagement_id].temperature_score = s.temperature_score;
        map[s.engagement_id].client_sentiment = s.client_sentiment;
      }
    }
    for (const r of (sosRes.data ?? []) as any[]) if (map[r.engagement_id]) map[r.engagement_id].open_sos += 1;
    for (const r of (risksRes.data ?? []) as any[]) if (map[r.engagement_id]) map[r.engagement_id].open_risks += 1;
    for (const s of (sectionsRes.data ?? []) as SectionRow[]) {
      const m = map[s.engagement_id];
      if (!m) continue;
      m.sections.total += 1;
      const st = (s.status ?? "").toLowerCase();
      if (st === "green") m.sections.green += 1;
      else if (st === "yellow") m.sections.yellow += 1;
      else if (st === "red") m.sections.red += 1;
      else m.sections.gray += 1;
    }
    setRollups(map);

    // Critical alerts
    const idToName = new Map(leadership.map((m) => [m.engagement.id, m.engagement.name]));
    const alerts: CriticalAlert[] = [];
    for (const r of (sosRes.data ?? []) as any[]) {
      alerts.push({
        id: `sos-${r.id}`,
        engagement_id: r.engagement_id,
        engagement_name: idToName.get(r.engagement_id) ?? "—",
        kind: "Signal",
        title: r.description ?? r.category ?? "Signal raised",
        severity: r.severity,
        created_at: r.created_at,
      });
    }
    for (const r of (risksRes.data ?? []) as any[]) {
      if (r.severity === "High" || r.severity === "Critical" || r.severity === "Severe") {
        alerts.push({
          id: `risk-${r.id}`,
          engagement_id: r.engagement_id,
          engagement_name: idToName.get(r.engagement_id) ?? "—",
          kind: "Risk",
          title: r.title,
          severity: r.severity,
          created_at: r.created_at,
        });
      }
    }
    alerts.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    setCriticalAlerts(alerts.slice(0, 12));

    // Collective members (distinct users)
    const distinct = new Set<string>();
    for (const m of (collectiveRes.data ?? []) as any[]) if (m.user_id) distinct.add(m.user_id);
    setCollectiveCount(distinct.size);

    setMarketItems((marketRes.data ?? []) as MarketItem[]);
    setLastUpdated(new Date());
    setFetching(false);
  }, [engagementIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
    const t = setInterval(() => refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  const kpis = useMemo(() => {
    const activeCount = leadership.length;
    let openSos = 0;
    let openRisks = 0;
    for (const r of Object.values(rollups)) {
      openSos += r.open_sos;
      openRisks += r.open_risks;
    }
    return { activeCount, openSos, openRisks };
  }, [leadership, rollups]);


  const sortedEngagements = useMemo(() => {
    return [...leadership].sort((a, b) => {
      const da = a.engagement.submission_date
        ? new Date(a.engagement.submission_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const db = b.engagement.submission_date
        ? new Date(b.engagement.submission_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }, [leadership]);

  function enter(id: string) {
    switchEngagement(id);
    navigate({ to: "/command", replace: true });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 pb-32">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={athenaLogo} alt="Athena" className="h-10 w-auto" />
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-[var(--gold)]">Athena</div>
              <h1 className="text-xl font-bold">Command Dashboard</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                  <Radio className="h-2.5 w-2.5 animate-pulse" />
                  Live
                </span>
                <span>Updated {lastUpdated.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ to: "/engagement/new" })}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em]"
              style={{ background: "var(--gold, #C49A2A)", color: "#0D0F1A" }}
            >
              + New Mission
            </button>
            <button
              onClick={() => navigate({ to: "/select-engagement" })}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover"
            >
              All engagements
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard icon={<Briefcase className="h-4 w-4" />} label="Active engagements" value={String(kpis.activeCount)} />
          <KpiCard
            icon={<Siren className="h-4 w-4" />}
            label="Open SOS"
            value={String(kpis.openSos)}
            tone={kpis.openSos > 0 ? "red" : "default"}
          />
          <KpiCard
            icon={<ShieldAlert className="h-4 w-4" />}
            label="Open risks"
            value={String(kpis.openRisks)}
            tone={kpis.openRisks > 0 ? "amber" : "default"}
          />
          <KpiCard icon={<Users className="h-4 w-4" />} label="Collective™ members" value={String(collectiveCount)} />
        </div>


        <HookFailuresPanel />

        {/* Engagement table */}
        <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Engagements
            </h2>
            <span className="text-[10px] text-muted-foreground">Sorted by submission date</span>
          </div>
          {fetching && sortedEngagements.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left">Engagement</th>
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-right">Days left</th>
                    <th className="px-3 py-2 text-center">Temp</th>
                    <th className="px-3 py-2 text-left">Section health</th>
                    <th className="px-3 py-2 text-center">Alerts</th>
                    <th className="px-3 py-2 text-left">Sentiment</th>
                    <th className="px-3 py-2 text-right">Enter</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEngagements.map((m) => {
                    const r = rollups[m.engagement.id];
                    const sub = m.engagement.submission_date
                      ? new Date(m.engagement.submission_date)
                      : null;
                    const days = sub
                      ? Math.ceil((sub.getTime() - Date.now()) / 86400000)
                      : null;
                    return (
                      <tr key={m.engagement.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                        <td className="px-3 py-3 font-semibold">{m.engagement.name}</td>
                        <td className="px-3 py-3 text-muted-foreground">{m.engagement.client}</td>
                        <td className={`px-3 py-3 text-right ${daysColor(days)}`}>
                          {days === null ? "—" : `${days}d`}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Thermometer className="h-3 w-3 text-muted-foreground" />
                            {r?.temperature_score ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <SectionHealthBar sections={r?.sections} />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {r?.open_sos ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                                <Siren className="h-2.5 w-2.5" />
                                {r.open_sos}
                              </span>
                            ) : null}
                            {r?.open_risks ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                <ShieldAlert className="h-2.5 w-2.5" />
                                {r.open_risks}
                              </span>
                            ) : null}
                            {!r?.open_sos && !r?.open_risks ? (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r?.client_sentiment ? (
                            <span className={SENTIMENT_COLOR[r.client_sentiment] ?? "text-muted-foreground"}>
                              {r.client_sentiment}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => enter(m.engagement.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-[var(--gold)]/60 hover:bg-surface-hover"
                          >
                            Enter <ArrowRight className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedEngagements.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No engagements yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom panels */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Critical alerts" icon={<AlertTriangle className="h-4 w-4 text-red-400" />}>
            {criticalAlerts.length === 0 ? (
              <EmptyClear message="No critical alerts across portfolio." />
            ) : (
              <ul className="space-y-2">
                {criticalAlerts.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-md border border-border bg-background/40 p-2 text-xs hover:border-red-500/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          a.kind === "SOS"
                            ? "bg-red-500/20 text-red-300"
                            : "bg-amber-500/20 text-amber-300"
                        }`}
                      >
                        {a.kind} · {a.severity ?? "—"}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="mt-1 line-clamp-2 font-medium">{a.title}</div>
                    <button
                      onClick={() => enter(a.engagement_id)}
                      className="mt-1 text-[10px] text-[var(--gold)] hover:underline"
                    >
                      {a.engagement_name} →
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Submission countdown" icon={<Calendar className="h-4 w-4 text-amber-400" />}>
            {sortedEngagements.filter((m) => m.engagement.submission_date).length === 0 ? (
              <EmptyClear message="No submission deadlines set." />
            ) : (
              <ul className="space-y-2">
                {sortedEngagements
                  .filter((m) => m.engagement.submission_date)
                  .slice(0, 8)
                  .map((m) => {
                    const sub = new Date(m.engagement.submission_date!);
                    const days = Math.ceil((sub.getTime() - Date.now()) / 86400000);
                    const r = rollups[m.engagement.id];
                    return (
                      <li
                        key={m.engagement.id}
                        className="rounded-md border border-border bg-background/40 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{m.engagement.name}</span>
                          <span className={daysColor(days)}>{days}d</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>{sub.toLocaleDateString()}</span>
                          {r?.health && (
                            <span className={`rounded border px-1 py-0 ${HEALTH_COLORS[r.health] ?? ""}`}>
                              {r.health}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Panel>

          <Panel title="Pipeline horizon" icon={<TrendingUp className="h-4 w-4 text-sky-400" />}>
            {marketItems.length === 0 ? (
              <EmptyClear message="No new market signals." />
            ) : (
              <ul className="space-y-2">
                {marketItems.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-md border border-border bg-background/40 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-300">
                        {m.source}
                      </span>
                      {m.published_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(m.published_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <a
                      href={m.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 line-clamp-2 block font-medium hover:text-[var(--gold)]"
                    >
                      {m.title}
                    </a>
                    {m.summary && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{m.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "default" | "red" | "amber" | "gold";
}) {
  const toneClass =
    tone === "red"
      ? "border-red-500/50 bg-red-500/10"
      : tone === "amber"
      ? "border-amber-500/50 bg-amber-500/10"
      : tone === "gold"
      ? "border-[var(--gold)]/40 bg-[var(--gold)]/5"
      : "border-border bg-surface";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function SectionHealthBar({ sections }: { sections?: Rollup["sections"] }) {
  if (!sections || sections.total === 0) {
    return <span className="text-[10px] text-muted-foreground">No sections</span>;
  }
  const { green, yellow, red, gray, total } = sections;
  const seg = (n: number, color: string) =>
    n > 0 ? <div className={`${color} h-2`} style={{ width: `${(n / total) * 100}%` }} /> : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-2 w-full overflow-hidden rounded bg-background/60">
        {seg(green, "bg-emerald-500")}
        {seg(yellow, "bg-amber-500")}
        {seg(red, "bg-red-500")}
        {seg(gray, "bg-slate-500")}
      </div>
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span className="text-emerald-400">{green}</span>
        <span className="text-amber-400">{yellow}</span>
        <span className="text-red-400">{red}</span>
        <span>{total} total</span>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {icon}
        <h3 className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="max-h-[420px] overflow-y-auto p-3">{children}</div>
    </div>
  );
}

function EmptyClear({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-center text-xs text-emerald-300">
      ✓ All clear · {message}
    </div>
  );
}
