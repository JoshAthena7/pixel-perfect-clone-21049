import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { signalTypeLabel, relativeTime } from "@/lib/signals";
import { Activity, AlertTriangle, AlertCircle, ArrowRight, Plus, GitBranch, Radio, Megaphone, Newspaper, CalendarClock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  component: AthenaHQ,
});

type Mission = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  health: "Green" | "Yellow" | "Red";
  status: string | null;
  submission_date: string | null;
  question_count: number | null;
};

type Signal = {
  id: string;
  mission_id: string;
  signal_type: string;
  signal_title: string;
  signal_summary: string | null;
  severity: "info" | "warning" | "critical";
  created_at: string;
  related_question_id: string | null;
};

const HEALTH_BORDER: Record<string, string> = {
  Green: "border-l-emerald-500",
  Yellow: "border-l-amber-400",
  Red: "border-l-destructive",
};
const HEALTH_GLOW: Record<string, string> = {
  Green: "hover:shadow-[0_0_0_1px_rgb(16_185_129/0.35),0_18px_60px_-30px_rgb(16_185_129/0.55)]",
  Yellow: "hover:shadow-[0_0_0_1px_rgb(251_191_36/0.35),0_18px_60px_-30px_rgb(251_191_36/0.55)]",
  Red: "hover:shadow-[0_0_0_1px_rgb(239_68_68/0.4),0_18px_60px_-30px_rgb(239_68_68/0.6)]",
};
const HEALTH_PILL: Record<string, string> = {
  Green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Red: "bg-destructive/15 text-destructive border-destructive/30",
};

function AthenaHQ() {
  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
      return { name: data?.display_name ?? "operator" };
    },
  });

  const { data: missions = [] } = useQuery({
    queryKey: ["hq-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,status,submission_date,question_count")
        .eq("status", "Active")
        .order("submission_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as Mission[];
    },
  });

  const attentionFn = useServerFn(irisLeadershipAttention);
  const { data: attention } = useQuery({
    queryKey: ["leadership-attention"],
    queryFn: () => attentionFn(),
    refetchInterval: 60_000,
  });
  const attMap = new Map((attention?.missions ?? []).map((m) => [m.mission_id, m.attention_score]));
  const totalAttention = (attention?.missions ?? []).reduce((s, m) => s + m.attention_score, 0);

  // mission-id → display name (for pills)
  const missionMap = new Map(missions.map((m) => [m.id, m.name]));

  const { data: topSignals = [] } = useQuery({
    queryKey: ["hq-top-signals"],
    queryFn: async () => {
      const { data: crit = [] } = await supabase
        .from("signals")
        .select("id,mission_id,signal_type,signal_title,signal_summary,severity,created_at,related_question_id")
        .eq("status", "open").eq("severity", "critical")
        .order("created_at", { ascending: false }).limit(5);
      let combined = (crit ?? []) as Signal[];
      if (combined.length < 5) {
        const { data: warn = [] } = await supabase
          .from("signals")
          .select("id,mission_id,signal_type,signal_title,signal_summary,severity,created_at,related_question_id")
          .eq("status", "open").eq("severity", "warning")
          .order("created_at", { ascending: false }).limit(5 - combined.length);
        combined = [...combined, ...((warn ?? []) as Signal[])];
      }
      return combined;
    },
    refetchInterval: 30_000,
  });

  const { data: openConflicts = [] } = useQuery({
    queryKey: ["hq-conflicts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select("id,mission_id,description,severity,detected_at")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: firmActivity = [] } = useQuery({
    queryKey: ["hq-activity"],
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("id,mission_id,signal_type,signal_title,severity,created_at")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const { data: leadershipMessages = [] } = useQuery({
    queryKey: ["hq-leadership-messages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id,text,from_name,created_at")
        .is("mission_id", null)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: marketNews = [] } = useQuery({
    queryKey: ["hq-market-news"],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_intelligence")
        .select("id,source,type,title,url,published_at,created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const pipeline = missions.slice().sort((a, b) => {
    const da = a.submission_date ? new Date(a.submission_date).getTime() : Infinity;
    const db = b.submission_date ? new Date(b.submission_date).getTime() : Infinity;
    return da - db;
  });

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const statusLabel = totalAttention === 0
    ? "All systems operational"
    : `${totalAttention} ${totalAttention === 1 ? "item needs" : "items need"} attention`;

  return (
    <div className="min-h-screen bg-background">
      {/* HQ HEADER */}
      <header className="border-b border-border bg-gradient-to-b from-surface to-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-8 py-7">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">Athena HQ</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              {greeting}, {profile?.name ?? "…"}.
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{today}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Firm status</div>
              <div className={`mt-1 text-sm font-medium ${totalAttention === 0 ? "text-emerald-400" : totalAttention >= 50 ? "text-destructive" : "text-amber-400"}`}>
                {statusLabel}
              </div>
            </div>
            <AttentionBadge missionId="all" variant="header" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-12">
        {/* ACTIVE MISSIONS */}
        <section>
          <div className="mb-5 flex items-end justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Active Missions</h2>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{missions.length} in flight</p>
            </div>
          </div>

          {missions.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-border bg-surface/50 px-8 py-16 text-center">
              <p className="text-sm text-muted-foreground">No active missions. Open your first one to begin.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {missions.map((m) => (
                <MissionCard key={m.id} mission={m} attention={attMap.get(m.id) ?? 0} />
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-center">
            <Link
              to="/missions/new"
              className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Open New Mission
            </Link>
          </div>
        </section>

        {/* INTEL FEED + ACTIVITY */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* IRIS HQ Brief */}
          <div className="lg:col-span-3 rounded-[12px] border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">IRIS — Across All Missions</h3>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Live</span>
            </div>

            <div className="px-5 py-4 space-y-3">
              {topSignals.length === 0 && openConflicts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  IRIS is quiet across all missions.
                </p>
              ) : (
                <>
                  {topSignals.map((s) => (
                    <SignalRow key={s.id} signal={s} missionName={missionMap.get(s.mission_id)} />
                  ))}

                  {openConflicts.length > 0 && (
                    <div className="pt-2">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        <GitBranch className="h-3 w-3" /> Open Alignment Conflicts
                      </div>
                      <ul className="space-y-2">
                        {openConflicts.map((c: any) => (
                          <li key={c.id} className="flex items-start gap-3 rounded-[8px] border border-border bg-background p-3">
                            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${c.severity === "critical" ? "bg-destructive" : "bg-amber-400"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <MissionPill name={missionMap.get(c.mission_id) ?? "—"} />
                                <span className="text-[10px] text-muted-foreground">{relativeTime(c.detected_at)}</span>
                              </div>
                              <p className="mt-1 text-sm text-foreground line-clamp-2">{c.description}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Firm Activity */}
          <div className="lg:col-span-2 rounded-[12px] border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Firm Activity</h3>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Last 10</span>
            </div>
            <ul className="divide-y divide-border">
              {firmActivity.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet.</li>
              )}
              {firmActivity.map((s: any) => (
                <li key={s.id} className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      s.severity === "critical" ? "bg-destructive" :
                      s.severity === "warning" ? "bg-amber-400" : "bg-primary/60"
                    }`} />
                    <MissionPill name={missionMap.get(s.mission_id) ?? "—"} />
                    <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(s.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground line-clamp-2">{s.signal_title}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function MissionCard({ mission, attention }: { mission: Mission; attention: number }) {
  const days = mission.submission_date
    ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
    : null;
  const countdownTone = days === null ? "text-muted-foreground"
    : days <= 7 ? "text-destructive"
    : days <= 21 ? "text-amber-400"
    : "text-foreground";

  return (
    <Link
      to="/missions/$missionId/overview"
      params={{ missionId: mission.id }}
      className={`group block rounded-[12px] border border-border border-l-4 bg-surface p-5 transition-all duration-200 ${HEALTH_BORDER[mission.health] ?? "border-l-border"} ${HEALTH_GLOW[mission.health] ?? ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-foreground truncate">{mission.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{mission.client}{mission.state ? ` · ${mission.state}` : ""}</p>
        </div>
        {attention > 0 && (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
            attention >= 50 ? "border-destructive/40 bg-destructive/10 text-destructive" :
            attention >= 20 ? "border-amber-500/40 bg-amber-500/10 text-amber-400" :
            "border-primary/30 bg-primary/5 text-primary"
          }`}>
            ATT {attention}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${HEALTH_PILL[mission.health] ?? ""}`}>
          {mission.health}
        </span>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
          {mission.question_count ?? 0} Q
        </span>
        {days !== null && (
          <span className={`ml-auto text-xs font-semibold tabular-nums ${countdownTone}`}>
            {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
        <span>Enter war room</span>
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function SignalRow({ signal, missionName }: { signal: Signal; missionName?: string }) {
  return (
    <Link
      to={signal.related_question_id ? "/missions/$missionId/questions/$questionId" : "/missions/$missionId/overview"}
      params={signal.related_question_id
        ? { missionId: signal.mission_id, questionId: signal.related_question_id }
        : { missionId: signal.mission_id }}
      className="flex items-start gap-3 rounded-[8px] border border-border bg-background p-3 transition hover:border-primary/50"
    >
      <SeverityIcon severity={signal.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <MissionPill name={missionName ?? "—"} />
          <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${
            signal.severity === "critical" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-400"
          }`}>{signalTypeLabel(signal.signal_type)}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(signal.created_at)}</span>
        </div>
        <p className="mt-1 text-sm text-foreground">{signal.signal_title}</p>
        {signal.signal_summary && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{signal.signal_summary}</p>
        )}
      </div>
    </Link>
  );
}

function MissionPill({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground/80 truncate max-w-[160px]">
      {name}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />;
  return <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />;
}
