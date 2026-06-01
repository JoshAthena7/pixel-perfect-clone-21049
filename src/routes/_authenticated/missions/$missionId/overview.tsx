import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { relativeTime, signalTypeLabel } from "@/lib/signals";
import { ListChecks, FolderOpen, BookOpen, Settings, Activity, AlertTriangle, AlertCircle, ArrowRight, Megaphone, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/overview")({
  component: OverviewPage,
});

const HEALTH_PILL: Record<string, string> = {
  Green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Yellow: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Red: "bg-destructive/15 text-destructive border-destructive/30",
};

function OverviewPage() {
  const { missionId } = Route.useParams();

  const { data: mission } = useQuery({
    queryKey: ["mission-overview", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,status,submission_date,description,question_count")
        .eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["overview-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,health,current_score,status,pens_down_date")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const { data: signals = [] } = useQuery({
    queryKey: ["overview-iris-alerts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("signals")
        .select("id,signal_type,signal_title,severity,created_at,related_question_id")
        .eq("mission_id", missionId)
        .in("severity", ["warning", "critical"])
        .order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
  });

  const { data: leadershipNotes = [] } = useQuery({
    queryKey: ["overview-leadership-notes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("broadcasts")
        .select("id,text,from_name,created_at")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false }).limit(6);
      return data ?? [];
    },
  });

  const { data: winThemes = [] } = useQuery({
    queryKey: ["overview-themes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,key_message").eq("mission_id", missionId).eq("status", "active");
      return data ?? [];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["overview-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members").select("id,display_name,role").eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const days = mission?.submission_date
    ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
    : null;
  const greenCount = questions.filter((q: any) => q.health === "green").length;
  const yellowCount = questions.filter((q: any) => q.health === "yellow").length;
  const redCount = questions.filter((q: any) => q.health === "red").length;
  const scored = questions.filter((q: any) => q.current_score != null);
  const avgScore = scored.length
    ? (scored.reduce((s: number, q: any) => s + Number(q.current_score), 0) / scored.length).toFixed(2)
    : "—";

  return (
    <div className="mx-auto max-w-[1280px] px-8 py-10 space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Mission Overview</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{mission?.name ?? "…"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mission?.client}{mission?.state ? ` · ${mission.state}` : ""}
            {days !== null && (
              <> · <span className={days <= 7 ? "text-destructive" : days <= 21 ? "text-amber-400" : ""}>
                {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d to submission`}
              </span></>
            )}
          </p>
          {mission?.description && (
            <p className="mt-3 max-w-2xl text-sm text-foreground/80 leading-relaxed">{mission.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {mission?.health && (
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${HEALTH_PILL[mission.health] ?? ""}`}>
              {mission.health}
            </span>
          )}
          <AttentionBadge missionId={missionId} variant="header" />
        </div>
      </header>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Questions" value={questions.length} />
        <Stat label="Green" value={greenCount} tone="emerald" />
        <Stat label="Yellow" value={yellowCount} tone="amber" />
        <Stat label="Red" value={redCount} tone="red" />
        <Stat label="Avg Score" value={avgScore} />
      </section>

      {/* (removed legacy quick-nav; replaced by Primary CTAs below) */}


      {/* Primary CTAs */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PrimaryCta to="/missions/$missionId" params={{ missionId }} label="Enter Mission Studio" sub="Where writers work" icon={<ListChecks className="h-5 w-5" />} tone="primary" />
        <PrimaryCta to="/missions/$missionId/library" params={{ missionId }} label="Open Library" sub="Source documents" icon={<FolderOpen className="h-5 w-5" />} />
        <PrimaryCta to="/missions/$missionId/briefing" params={{ missionId }} label="Open Briefing Book" sub="IRIS intelligence" icon={<BookOpen className="h-5 w-5" />} />
      </section>

      {/* Secondary nav */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-2">
        <QuickLink to="/missions/$missionId/brief" params={{ missionId }} label="IRIS Brief" icon={<Sparkles className="h-4 w-4" />} />
        <QuickLink to="/missions/$missionId/settings" params={{ missionId }} label="Settings" icon={<Settings className="h-4 w-4" />} />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Latest IRIS Alerts */}
        <div className="lg:col-span-2 rounded-[12px] border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Latest IRIS Alerts</h2>
          </div>
          <ul className="divide-y divide-border">
            {signals.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">IRIS has no alerts for this mission.</li>
            )}
            {signals.map((s: any) => (
              <li key={s.id} className="px-5 py-3 flex items-start gap-3">
                {s.severity === "critical" ? <AlertCircle className="h-4 w-4 mt-0.5 text-destructive" />
                  : s.severity === "warning" ? <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-400" />
                  : <Activity className="h-4 w-4 mt-0.5 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{signalTypeLabel(s.signal_type)}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{relativeTime(s.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-sm">{s.signal_title}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Leadership Notes */}
          <div className="rounded-[12px] border border-border bg-surface">
            <div className="border-b border-border px-5 py-4 flex items-center gap-2">
              <Megaphone className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leadership Notes</h2>
            </div>
            <ul className="px-5 py-3 space-y-2">
              {leadershipNotes.length === 0 && (
                <li className="text-sm text-muted-foreground py-3">No leadership notes for this mission yet.</li>
              )}
              {leadershipNotes.map((n: any) => (
                <li key={n.id} className="rounded-[8px] border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-foreground/90">{n.from_name}</span>
                    <span className="text-[10px] text-muted-foreground">{relativeTime(n.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground/90 leading-relaxed">{n.text}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[12px] border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Win Themes</h2>
            </div>
            <ul className="px-5 py-3 space-y-2">
              {winThemes.length === 0 && <li className="text-sm text-muted-foreground py-3">None defined yet.</li>}
              {winThemes.map((w: any) => (
                <li key={w.id} className="rounded-[8px] border border-border bg-background p-3">
                  <div className="text-sm font-medium">{w.title}</div>
                  {w.key_message && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{w.key_message}</p>}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-[12px] border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Team</h2>
            </div>
            <ul className="px-5 py-3 space-y-2">
              {members.length === 0 && <li className="text-sm text-muted-foreground py-3">No members yet.</li>}
              {members.map((m: any) => (
                <li key={m.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{m.display_name ?? "—"}</span>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
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

function QuickLink({ to, params, label, icon }: { to: string; params: any; label: string; icon: React.ReactNode }) {
  return (
    <Link
      to={to as any}
      params={params}
      className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-4 py-3 text-sm transition hover:border-primary/50 hover:bg-surface-hover"
    >
      {icon} <span>{label}</span>
    </Link>
  );
}

function PrimaryCta({ to, params, label, sub, icon, tone }: { to: string; params: any; label: string; sub: string; icon: React.ReactNode; tone?: "primary" }) {
  const base = tone === "primary"
    ? "border-primary/40 bg-primary/10 hover:bg-primary/15 text-primary"
    : "border-border bg-surface hover:bg-surface-hover text-foreground";
  return (
    <Link to={to as any} params={params} className={`group flex items-center justify-between gap-4 rounded-[12px] border px-5 py-4 transition ${base}`}>
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-background/40 p-2">{icon}</span>
        <div>
          <div className="text-sm font-semibold">{label}</div>
          <div className="text-[11px] text-muted-foreground">{sub}</div>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
