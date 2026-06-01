import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { irisLeadershipAttention } from "@/lib/iris.functions";
import { AttentionBadge } from "@/components/v2/AttentionBadge";
import { relativeTime } from "@/lib/signals";
import { MissionGridSkeleton, QuestionListSkeleton } from "@/components/v2/Skeletons";
import { ArrowRight, Megaphone, CalendarClock, DoorOpen, ListChecks, Search, Globe, Sparkles } from "lucide-react";
import { HORIZON_FILTERS, inferCategory, matchesHorizonFilter, type IntelItem } from "@/lib/intelligence-feed";
import { LiveBadge, ScanningBeam, IrisWaveform } from "@/components/v2/effects";
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

  // HORIZON FEED — firm-wide industry intelligence
  const { data: horizonItems = [] } = useQuery({
    queryKey: ["horizon-feed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("market_intelligence")
        .select("id,source,type,category,title,summary,url,published_at,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as IntelItem[];
    },
    refetchInterval: 60_000,
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
        {/* ASK IRIS — global query bar with waveform */}
        <AskIrisBar />

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
                title="No active missions yet."
                subtitle="Olympus is where missions are activated and configured."
                cta={
                  <Link to="/olympus" className="btn-primary inline-flex items-center gap-2">
                    <span aria-hidden>⚡</span> Enter Olympus to activate your first mission
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                }
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
                        <span className="mono-q text-[11px] font-semibold shrink-0">{q.question_number}</span>
                        <span className="flex-1 min-w-0 truncate text-sm text-foreground">{q.title}</span>
                        {q.current_score !== null && (
                          <span className="shrink-0 text-[11px] mono-score text-muted-foreground">{Number(q.current_score).toFixed(1)}</span>
                        )}
                        <span className={`shrink-0 text-xs font-semibold mono-days ${tone}`}>
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


        {/* HORIZON FEED — firm-wide industry intelligence */}
        <HorizonFeed items={horizonItems} missionCount={missions.length} />

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

        {/* PIPELINE HORIZON */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-5 rounded-[12px] border border-border bg-surface">
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
      data-health={mission.health}
      className={`mission-card group relative block rounded-[12px] border border-border border-l-4 bg-surface p-5 transition-all duration-200 ease-out hover:-translate-y-0.5 ${HEALTH_GLOW[mission.health] ?? ""}`}
      style={{ minHeight: 140 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[1.1rem] font-bold text-foreground">{mission.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{mission.client}{mission.state ? ` · ${mission.state}` : ""}</p>
        </div>
        {attention > 0 && (
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold mono ${
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
          <span className={`ml-auto text-xl font-semibold mono-days leading-none ${countdownTone}`}>
            {days < 0 ? `${Math.abs(days)}d` : `${days}d`}
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-muted-foreground mono">
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

function MissionPill({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-medium text-foreground/80 truncate max-w-[160px]">
      {name}
    </span>
  );
}

// ─── HORIZON FEED ──────────────────────────────────────────────────────────

function HorizonFeed({ items, missionCount }: { items: IntelItem[]; missionCount: number }) {
  const [filter, setFilter] = useState<string>("All");
  const [search, setSearch] = useState("");

  const enriched = useMemo(
    () => items.map((it) => ({ ...it, _cat: inferCategory(it) })),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((it) => {
      if (!matchesHorizonFilter(it._cat, filter)) return false;
      if (!q) return true;
      const hay = `${it.title ?? ""} ${it.summary ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [enriched, filter, search]);

  return (
    <section className="iris-panel rounded-[12px] border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-primary" />
          <h3 className="iris-label">Horizon Feed</h3>
          <LiveBadge />
          <span className="ml-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            What is happening in our industry
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search intelligence…"
            className="w-64 rounded-[8px] border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background/30 px-5 py-2.5">
        {HORIZON_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`pill-classified ${filter === f ? "is-active" : ""}`}
          >
            {f}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-border max-h-[640px] overflow-y-auto">
        {filtered.length === 0 ? (
          items.length === 0 ? (
            <li><ScanningBeam /></li>
          ) : (
            <li className="px-5 py-12 text-center text-sm text-muted-foreground">
              No items match this filter.
            </li>
          )
        ) : (
          filtered.map((it, idx) => (
            <li
              key={it.id}
              className="px-5 py-4 feed-item"
              style={{ animationDelay: `${Math.min(idx, 12) * 80}ms` }}
            >
              <a
                href={it.url ?? "#"}
                target={it.url ? "_blank" : undefined}
                rel="noreferrer"
                className="block group"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {it._cat && (
                    <span className="rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-primary">
                      {it._cat}
                    </span>
                  )}
                  <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{it.source}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground mono">
                    {relativeTime(it.published_at ?? it.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-foreground group-hover:text-primary">{it.title}</p>
                {it.summary && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{it.summary}</p>
                )}
                {missionCount > 0 && (
                  <p className="mt-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
                    Relevant to {missionCount} active {missionCount === 1 ? "mission" : "missions"}
                  </p>
                )}
              </a>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

