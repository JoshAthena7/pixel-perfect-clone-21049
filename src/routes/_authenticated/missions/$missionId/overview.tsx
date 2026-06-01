import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { relativeTime, signalTypeLabel } from "@/lib/signals";
import {
  ChevronDown, ChevronRight, FolderOpen, BookOpen, PenLine, GitBranch,
  AlertCircle, AlertTriangle, Activity, Sparkles, RefreshCw, ArrowRight, Megaphone, Clock,
} from "lucide-react";
import { TypewriterText } from "@/components/v2/effects";

export const Route = createFileRoute("/_authenticated/missions/$missionId/overview")({
  component: MissionHomePage,
});

const HEALTH_PILL: Record<string, string> = {
  Green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Red: "bg-destructive/15 text-destructive border-destructive/30",
};

function daysColor(d: number | null): string {
  if (d === null) return "text-muted-foreground";
  if (d < 0) return "text-destructive";
  if (d <= 7) return "text-destructive";
  if (d <= 21) return "text-amber-400";
  return "text-foreground";
}

function MissionHomePage() {
  const { missionId } = Route.useParams();
  const [summaryOpen, setSummaryOpen] = useState(true);

  const { data: mission } = useQuery({
    queryKey: ["mhome-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,status,submission_date,description")
        .eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["mhome-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,health,current_score,target_score,status,pens_down_date,assigned_writer_id")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const writerIds = useMemo(
    () => Array.from(new Set(questions.map((q: any) => q.assigned_writer_id).filter(Boolean))),
    [questions],
  );
  const { data: writers = [] } = useQuery({
    queryKey: ["mhome-writers", writerIds],
    enabled: writerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name").in("id", writerIds as string[]);
      return data ?? [];
    },
  });
  const writerName = (id: string | null) => writers.find((w: any) => w.id === id)?.display_name ?? "Unassigned";

  const { data: signals = [] } = useQuery({
    queryKey: ["mhome-signals", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("id,signal_type,signal_title,severity,created_at,source_module")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const { data: broadcasts = [] } = useQuery({
    queryKey: ["mhome-broadcasts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id,text,from_name,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const { data: vaultCount = 0 } = useQuery({
    queryKey: ["mhome-vault-count", missionId],
    queryFn: async () => {
      const { count } = await supabase
        .from("mission_library").select("id", { count: "exact", head: true }).eq("mission_id", missionId);
      return count ?? 0;
    },
  });

  const { data: oracleUpdated } = useQuery({
    queryKey: ["mhome-oracle-updated", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("briefing_book_sections")
        .select("generated_at")
        .eq("mission_id", missionId)
        .order("generated_at", { ascending: false }).limit(1).maybeSingle();
      return data?.generated_at ?? null;
    },
  });

  const { data: myRole } = useQuery({
    queryKey: ["mhome-my-role", missionId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from("mission_members").select("role").eq("mission_id", missionId).eq("user_id", user.id).maybeSingle();
      return data?.role ?? null;
    },
  });
  const isLeader = myRole === "admin" || myRole === "lead";

  const days = mission?.submission_date
    ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
    : null;

  const greenC = questions.filter((q: any) => q.health === "green").length;
  const yellowC = questions.filter((q: any) => q.health === "yellow").length;
  const redC = questions.filter((q: any) => q.health === "red").length;
  const atRisk = questions
    .filter((q: any) => q.health === "red" || q.health === "yellow")
    .sort((a: any, b: any) => (a.health === "red" ? -1 : 1) - (b.health === "red" ? -1 : 1))
    .slice(0, 3);
  const scored = questions.filter((q: any) => q.current_score != null);
  const avgScore = scored.length
    ? (scored.reduce((s: number, q: any) => s + Number(q.current_score), 0) / scored.length).toFixed(2)
    : "—";

  const upcomingPensDown = useMemo(() => {
    return questions
      .filter((q: any) => q.pens_down_date)
      .sort((a: any, b: any) => new Date(a.pens_down_date).getTime() - new Date(b.pens_down_date).getTime())
      .slice(0, 3);
  }, [questions]);

  const nearestPensDown = upcomingPensDown[0]?.pens_down_date
    ? Math.ceil((new Date(upcomingPensDown[0].pens_down_date).getTime() - Date.now()) / 86400000)
    : null;

  const oracleAgo = oracleUpdated ? relativeTime(oracleUpdated) : "never";

  // IRIS summary — synthesized from data
  const irisSummary = useMemo(() => {
    if (!mission) return "";
    const parts: string[] = [];
    if (days !== null) {
      if (days < 0) parts.push(`Submission is ${Math.abs(days)} days overdue.`);
      else if (days <= 7) parts.push(`Submission in ${days} days — critical window.`);
      else if (days <= 21) parts.push(`Submission in ${days} days.`);
      else parts.push(`Submission in ${days} days; comfortable runway.`);
    }
    if (questions.length === 0) {
      parts.push("No questions are loaded yet — upload the RFP from The Vault to populate the work.");
    } else {
      parts.push(`${questions.length} questions in flight: ${greenC} green, ${yellowC} yellow, ${redC} red.`);
      if (avgScore !== "—") parts.push(`Weighted average score is ${avgScore}.`);
      if (redC > 0) parts.push(`${redC} red question${redC > 1 ? "s need" : " needs"} immediate writer or SME attention.`);
    }
    if (signals.length === 0) parts.push("No new signals in the last cycle.");
    else parts.push(`${signals.length} recent signal${signals.length > 1 ? "s" : ""} flowing from the team.`);
    return parts.join(" ");
  }, [mission, days, questions.length, greenC, yellowC, redC, avgScore, signals.length]);

  const [summaryRefreshedAt, setSummaryRefreshedAt] = useState<Date>(() => new Date());
  const refreshSummary = () => setSummaryRefreshedAt(new Date());

  const total = greenC + yellowC + redC;

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-10 space-y-8 page-enter">
      {/* HEADER */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Mission Home</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{mission?.name ?? "…"}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mission?.client}
            {mission?.state ? ` · ${mission.state}` : ""}
            {days !== null && (
              <> · <span className={daysColor(days)}>
                {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d to submission`}
              </span></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {mission?.health && (
            <span className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${HEALTH_PILL[mission.health] ?? ""}`}>
              <span className={`dot dot-${mission.health.toLowerCase()}`} /> {mission.health}
            </span>
          )}
          <AttentionBadge missionId={missionId} variant="header" />
        </div>
      </header>

      {/* ROW 1 — MISSION SUMMARY */}
      <section className="rounded-[12px] border border-border bg-surface">
        <button
          onClick={() => setSummaryOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-3 text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mission Summary</span>
          {summaryOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>
        {summaryOpen && (
          <div className="border-t border-border px-5 py-4 space-y-4">
            {mission?.description && (
              <p className="text-sm text-foreground/90 leading-relaxed">{mission.description}</p>
            )}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Meta label="Program" value={mission?.client ?? "—"} />
              <Meta label="State" value={mission?.state ?? "—"} />
              <Meta label="Submission" value={mission?.submission_date ? new Date(mission.submission_date).toLocaleDateString() : "—"} />
              <Meta label="Nearest Pens Down" value={nearestPensDown !== null ? `${nearestPensDown}d` : "—"} />
            </div>
          </div>
        )}
      </section>

      {/* ROW 2 — STATS */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total Questions" value={questions.length} />
        <Stat label="Questions at Risk" value={redC + yellowC} tone={redC > 0 ? "red" : yellowC > 0 ? "amber" : undefined} />
        <Stat label="Avg Score" value={avgScore} />
        <Stat label="Nearest Pens Down" value={nearestPensDown !== null ? `${nearestPensDown}d` : "—"} tone={nearestPensDown !== null && nearestPensDown <= 7 ? "red" : undefined} />
      </section>

      {/* ROW 3 — HEALTH + ACTIVITY */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LEFT: Mission Health */}
        <div className="rounded-[12px] border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mission Health</h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            {total === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No question health to report yet.</p>
            ) : (
              <>
                <div className="flex items-center gap-3 text-xs">
                  <HealthChip color="green" count={greenC} />
                  <HealthChip color="yellow" count={yellowC} />
                  <HealthChip color="red" count={redC} />
                </div>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted/30">
                  {greenC > 0 && <div className="bg-emerald-500" style={{ width: `${(greenC / total) * 100}%` }} />}
                  {yellowC > 0 && <div className="bg-amber-400" style={{ width: `${(yellowC / total) * 100}%` }} />}
                  {redC > 0 && <div className="bg-destructive" style={{ width: `${(redC / total) * 100}%` }} />}
                </div>
              </>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Top at-risk questions</div>
              {atRisk.length === 0 ? (
                <p className="text-sm text-emerald-400">All clear — no questions at risk.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {atRisk.map((q: any) => (
                    <li key={q.id} className="flex items-center gap-3 py-2">
                      <span className={`dot dot-${q.health}`} />
                      <span className="font-mono text-xs text-muted-foreground w-10">{q.question_number}</span>
                      <Link
                        to="/missions/$missionId/questions/$questionId"
                        params={{ missionId, questionId: q.id }}
                        className="flex-1 truncate text-sm hover:text-primary"
                      >
                        {q.title}
                      </Link>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Recent Activity */}
        <div className="rounded-[12px] border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Recent Activity</h2>
          </div>
          <ul className="divide-y divide-border">
            {signals.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">No recent activity. IRIS is monitoring.</li>
            ) : signals.map((s: any) => {
              const isIris = s.source_module === "iris" || s.source_module === "IRIS";
              return (
                <li key={s.id} className={`flex items-start gap-3 px-5 py-3 ${isIris ? "iris-panel" : ""}`}>
                  {s.severity === "critical" ? <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                    : s.severity === "warning" ? <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400 shrink-0" />
                    : <Activity className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase tracking-[0.12em] ${isIris ? "iris-label" : "text-muted-foreground"}`}>
                        {signalTypeLabel(s.signal_type)}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(s.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-sm truncate">
                      {isIris ? <TypewriterText text={s.signal_title} speed={20} /> : s.signal_title}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ROW 4 — QUICK LINKS */}
      <section className={`grid grid-cols-1 gap-3 md:grid-cols-${isLeader ? 4 : 3}`}>
        <QuickCard to="/missions/$missionId/library" params={{ missionId }} icon={<FolderOpen className="h-5 w-5" />} label="The Vault" sub={`${vaultCount} document${vaultCount === 1 ? "" : "s"}`} />
        <QuickCard to="/missions/$missionId/briefing" params={{ missionId }} icon={<BookOpen className="h-5 w-5" />} label="The Oracle" sub={`Last updated ${oracleAgo}`} />
        <QuickCard to="/missions/$missionId/questions" params={{ missionId }} icon={<PenLine className="h-5 w-5" />} label="The Studio" sub={`${questions.length} question${questions.length === 1 ? "" : "s"}`} tone="primary" />
        {isLeader && (
          <QuickCard to="/command/question-health" icon={<GitBranch className="h-5 w-5" />} label="The Bridge" sub="Cross-mission view" />
        )}
      </section>

      {/* ROW 5 — LEADERSHIP NOTES */}
      <section className="rounded-[12px] border border-border bg-surface">
        <div className="border-b border-border px-5 py-4 flex items-center gap-2">
          <Megaphone className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leadership Notes</h2>
        </div>
        <div className="px-5 py-4">
          {broadcasts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No leadership notes yet.</p>
          ) : (
            <ul className="space-y-2">
              {broadcasts.map((n: any) => (
                <li key={n.id} className="rounded-[8px] border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-foreground/90">{n.from_name}</span>
                    <span className="text-[10px] text-muted-foreground">{relativeTime(n.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/90 leading-relaxed">{n.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ROW 6 — UPCOMING PENS DOWN */}
      <section className="rounded-[12px] border border-border bg-surface">
        <div className="border-b border-border px-5 py-4 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Upcoming Pens Down</h2>
        </div>
        {upcomingPensDown.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">No upcoming deadlines.</p>
        ) : (
          <ul className="divide-y divide-border">
            {upcomingPensDown.map((q: any) => {
              const d = Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000);
              return (
                <li key={q.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="font-mono text-xs text-muted-foreground w-10">{q.question_number}</span>
                  <span className={`dot dot-${q.health}`} />
                  <Link
                    to="/missions/$missionId/questions/$questionId"
                    params={{ missionId, questionId: q.id }}
                    className="flex-1 truncate text-sm hover:text-primary"
                  >
                    {q.title}
                  </Link>
                  <span className="text-xs text-muted-foreground truncate max-w-[140px]">{writerName(q.assigned_writer_id)}</span>
                  <span className={`text-xs font-medium tabular-nums w-16 text-right ${daysColor(d)}`}>{d < 0 ? `${Math.abs(d)}d over` : `${d}d`}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* IRIS SUMMARY */}
      <section className="rounded-[12px] iris-panel border border-border bg-surface">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" style={{ color: "#0891b2" }} />
            <h2 className="iris-label text-[11px] font-semibold uppercase tracking-[0.18em]">IRIS Mission Summary</h2>
          </div>
          <button
            onClick={refreshSummary}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground transition"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm text-foreground/90 leading-relaxed">{irisSummary || "IRIS is gathering signal…"}</p>
          <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Generated {relativeTime(summaryRefreshedAt.toISOString())}
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "emerald" | "amber" | "red" }) {
  const cls = tone === "emerald" ? "text-emerald-400"
    : tone === "amber" ? "text-amber-400"
    : tone === "red" ? "text-destructive"
    : "text-foreground";
  return (
    <div className="rounded-[10px] border border-border bg-surface px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium truncate">{value}</div>
    </div>
  );
}

function HealthChip({ color, count }: { color: "green" | "yellow" | "red"; count: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1">
      <span className={`dot dot-${color}`} />
      <span className="text-xs font-medium tabular-nums">{count}</span>
    </div>
  );
}

function QuickCard({ to, params, icon, label, sub, tone }: { to: string; params?: any; icon: React.ReactNode; label: string; sub: string; tone?: "primary" }) {
  const base = tone === "primary"
    ? "border-primary/40 bg-primary/10 hover:bg-primary/15 text-primary"
    : "border-border bg-surface hover:bg-surface-hover text-foreground";
  return (
    <Link to={to as any} params={params} className={`group flex items-center justify-between gap-3 rounded-[12px] border px-5 py-4 transition ${base}`}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="rounded-md bg-background/40 p-2 shrink-0">{icon}</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{label}</div>
          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
