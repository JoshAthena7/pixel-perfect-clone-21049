import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { signalTypeLabel, relativeTime } from "@/lib/signals";
import { MissionGridSkeleton, QuestionListSkeleton } from "@/components/v2/Skeletons";
import { Activity, AlertTriangle, AlertCircle, ArrowRight, GitBranch, Radio, Megaphone, Newspaper, CalendarClock, DoorOpen, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/_authenticated/home")({
  component: AthenaHQ,
});

function EmptyState({ icon, title, subtitle, cta }: { icon: ReactNode; title: string; subtitle?: string; cta?: ReactNode }) {
  return (
    <div className="rounded-[12px] border border-dashed border-border bg-surface/40 px-8 py-14 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center text-muted-foreground opacity-50">
        {icon}
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

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
  Green: "hover:shadow-[0_8px_24px_rgba(34,197,94,0.15)]",
  Yellow: "hover:shadow-[0_8px_24px_rgba(245,158,11,0.15)]",
  Red: "hover:shadow-[0_8px_24px_rgba(239,68,68,0.15)]",
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
      const { data } = await supabase.from("profiles").select("display_name,email").eq("id", user!.id).maybeSingle();
      const raw = data?.display_name?.trim() || data?.email?.split("@")[0] || user?.email?.split("@")[0] || "operator";
      const firstName = raw.split(/\s+/)[0];
      return { name: firstName };
    },
  });

  const { data: myRole } = useQuery({
    queryKey: ["my-mission-roles"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("mission_members").select("role").eq("user_id", user!.id);
      const roles = (data ?? []).map((r: any) => r.role);
      if (roles.includes("admin")) return "admin";
      if (roles.includes("lead")) return "lead";
      if (roles.length > 0) return roles[0];
      return null;
    },
  });
  const isLeader = myRole === "admin" || myRole === "lead";


  const { data: missions = [], isLoading: missionsLoading } = useQuery({
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

  // ARCH-1: Writer/SME assignments across all missions
  const { data: myAssignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["hq-my-assignments", myRole],
    enabled: myRole !== null && !isLeader,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,status,health,current_score,pens_down_date,assigned_writer_id,assigned_sme_id")
        .or(`assigned_writer_id.eq.${user.id},assigned_sme_id.eq.${user.id}`)
        .order("pens_down_date", { ascending: true, nullsFirst: false })
        .limit(50);
      return (data ?? []) as Array<{
        id: string; mission_id: string; question_number: string; title: string;
        status: string | null; health: string | null; current_score: number | null;
        pens_down_date: string | null; assigned_writer_id: string | null; assigned_sme_id: string | null;
      }>;
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
        .neq("status", "archived")
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
      {/* DESIGN-14: Atrium executive header */}
      <header className="border-b border-border bg-gradient-to-b from-surface to-background">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-6 px-8 py-8">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">The Atrium</div>
            <h1 className="h1-display mt-2">
              {greeting}, {profile?.name ?? "…"}.
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{today}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="h2-label">Firm Status</div>
              <div className={`mt-1.5 flex items-center justify-end gap-2 text-sm font-medium ${totalAttention === 0 ? "text-[color:var(--green)]" : totalAttention >= 50 ? "text-destructive" : "text-amber-400"}`}>
                {totalAttention === 0 && <span className="pulse-dot" />}
                {statusLabel}
              </div>
            </div>
            <AttentionBadge missionId="all" variant="header" />
          </div>
        </div>
      </header>


      <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-12">
        {/* ROLE-DIFFERENTIATED: Active Missions (leaders) or Your Assignments (writers/SMEs) */}
        {isLeader ? (
          <section>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="h2-label">Active Missions</h2>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">{missions.length} in flight</p>
              </div>
            </div>

            {missionsLoading ? (
              <MissionGridSkeleton count={3} />
            ) : missions.length === 0 ? (
              <EmptyState
                icon={<DoorOpen className="h-10 w-10" />}
                title="No missions yet."
                subtitle="Enter Olympus to create and activate your first mission."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {missions.map((m) => (
                  <MissionCard key={m.id} mission={m} attention={attMap.get(m.id) ?? 0} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section>
            <div className="mb-5 flex items-end justify-between">
              <div>
                <h2 className="h2-label">Your Assignments</h2>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight">
                  {myAssignments.length} {myAssignments.length === 1 ? "question" : "questions"} assigned to you
                </p>
              </div>
            </div>

            {assignmentsLoading ? (
              <QuestionListSkeleton count={5} />
            ) : myAssignments.length === 0 ? (
              <EmptyState
                icon={<ListChecks className="h-10 w-10" />}
                title="Your questions will appear here once your lead assigns them in Olympus."
                subtitle="Check back soon — you'll be notified when work is ready."
              />
            ) : (
              <ul className="divide-y divide-border rounded-[12px] border border-border bg-surface">
                {myAssignments.map((q) => {
                  const days = q.pens_down_date
                    ? Math.ceil((new Date(q.pens_down_date).getTime() - Date.now()) / 86400000)
                    : null;
                  const tone = days === null ? "text-muted-foreground"
                    : days < 0 ? "text-destructive"
                    : days <= 3 ? "text-destructive"
                    : days <= 7 ? "text-amber-400"
                    : "text-foreground";
                  const dotCls = q.health === "green" ? "dot dot-green"
                    : q.health === "red" ? "dot dot-red"
                    : "dot dot-yellow";
                  return (
                    <li key={q.id} className="px-5 py-3">
                      <Link
                        to="/missions/$missionId/questions/$questionId"
                        params={{ missionId: q.mission_id, questionId: q.id }}
                        className="flex items-center gap-3 hover:text-primary"
                      >
                        <span className={dotCls} />
                        <MissionPill name={missionMap.get(q.mission_id) ?? "—"} />
                        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground shrink-0">{q.question_number}</span>
                        <span className="flex-1 min-w-0 truncate text-sm text-foreground">{q.title}</span>
                        {q.current_score !== null && (
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{Number(q.current_score).toFixed(1)}</span>
                        )}
                        <span className={`shrink-0 text-xs font-semibold tabular-nums ${tone}`}>
                          {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}


        {/* INTEL FEED + ACTIVITY */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* IRIS HQ Brief */}
          <div className="lg:col-span-3 iris-panel rounded-[12px] border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="iris-dot" />
                <h3 className="iris-label">IRIS — Across All Missions</h3>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Live</span>
            </div>

            <div className="px-5 py-4 space-y-3">
              {topSignals.length === 0 && openConflicts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {missions.length === 0
                    ? "IRIS is ready. Activate a mission in Olympus and IRIS will begin monitoring immediately."
                    : "IRIS is monitoring. Upload documents to The Vault to generate intelligence."}
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
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">Activity will flow here as your team begins working.</li>
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

        {/* LEADERSHIP MESSAGES */}
        <section className="rounded-[12px] border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <Megaphone className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Leadership Messages</h3>
            </div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Firm-wide</span>
          </div>
          <ul className="divide-y divide-border">
            {leadershipMessages.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">No broadcasts yet. Leadership messages will appear here.</li>
            )}
            {leadershipMessages.map((m: any) => (
              <li key={m.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-foreground">{m.from_name}</span>
                  <span className="text-[10px] text-muted-foreground">{relativeTime(m.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-foreground/90 leading-relaxed">{m.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* MEDICAID & MEDICARE INTELLIGENCE + PIPELINE HORIZON */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 rounded-[12px] border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Newspaper className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Medicaid & Medicare Intelligence</h3>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Last 8</span>
            </div>
            <ul className="divide-y divide-border">
              {marketNews.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">IRIS is scanning for Medicaid and Medicare intelligence. Items will appear shortly.</li>
              )}
              {marketNews.map((n: any) => (
                <li key={n.id} className="px-5 py-3">
                  <a href={n.url ?? "#"} target={n.url ? "_blank" : undefined} rel="noreferrer" className="flex items-start gap-3 hover:text-primary">
                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground shrink-0">{n.source}</span>
                    <span className="flex-1 text-sm">{n.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(n.published_at ?? n.created_at)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-2 rounded-[12px] border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pipeline Horizon</h3>
              </div>
              <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{pipeline.length}</span>
            </div>
            <ul className="divide-y divide-border">
              {pipeline.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-muted-foreground">No active missions in pipeline.</li>
              )}
              {pipeline.map((m) => {
                const d = m.submission_date
                  ? Math.ceil((new Date(m.submission_date).getTime() - Date.now()) / 86400000)
                  : null;
                const tone = d === null ? "text-muted-foreground" : d <= 7 ? "text-destructive" : d <= 21 ? "text-amber-400" : "text-foreground";
                const dotCls = m.health === "Green" ? "dot dot-green" : m.health === "Red" ? "dot dot-red" : "dot dot-yellow";
                const risk = d === null ? null : d <= 7 ? "High" : d <= 21 ? "Medium" : "Low";
                const riskPill = risk === "High" ? "pill-red" : risk === "Medium" ? "pill-yellow" : "pill-green";
                return (
                  <li key={m.id} className="px-3 py-2">
                    <Link
                      to="/missions/$missionId/overview"
                      params={{ missionId: m.id }}
                      className="flex items-center gap-4 rounded-[8px] border border-transparent bg-transparent px-3 py-3 transition-colors hover:bg-surface-hover"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={dotCls} />
                          <div className="truncate text-sm font-semibold">{m.name}</div>
                        </div>
                        <div className="mt-0.5 truncate pl-4 text-[11px] text-muted-foreground">{m.client}{m.state ? ` · ${m.state}` : ""}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-semibold tabular-nums leading-none ${tone}`}>
                          {d === null ? "—" : d < 0 ? `${Math.abs(d)}` : `${d}`}
                        </div>
                        <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                          {d === null ? "" : d < 0 ? "d overdue" : "days"}
                        </div>
                      </div>
                      {risk && (
                        <span className={`pill ${riskPill}`}>{risk} Risk</span>
                      )}
                    </Link>
                  </li>
                );
              })}
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
      className={`group relative block rounded-[12px] border border-border border-l-4 bg-surface p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 ${HEALTH_BORDER[mission.health] ?? "border-l-border"} ${HEALTH_GLOW[mission.health] ?? ""}`}
      style={{ minHeight: 140 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[1.1rem] font-bold text-foreground">{mission.name}</h3>
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

      <div className="mt-4 flex items-center gap-3">
        <span className={`dot dot-${mission.health.toLowerCase()}`} />
        <span className="text-xs font-medium text-foreground/90">{mission.health}</span>
        {days !== null && (
          <span className={`ml-auto text-xl font-semibold tabular-nums leading-none ${countdownTone}`}>
            {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
          {mission.question_count ?? 0} questions
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
          Enter war room
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
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
