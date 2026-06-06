// Phase 5 — Strategic Portfolio View (Olympus).
// Strategic altitude, not operational. Patterns + decisions, not events + tasks.

import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ArrowRight, Zap, AlertTriangle, Users, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { IrisContextHealthPanel } from "@/components/admin/IrisContextHealthPanel";

const IRIS_INDIGO = "#6366F1";

type Mission = {
  id: string;
  name: string;
  client: string | null;
  status: string | null;
  health: string | null;
  submission_date: string | null;
  contract_value?: number | null;
};

type PortfolioIntel = {
  id: string;
  type: "org_risk" | "capacity" | "opportunity" | "positive";
  headline: string;
  body: string;
  affected_mission_ids: string[];
  action_label: string | null;
  action_filter: string | null;
  generated_at: string;
};

type ExecDecision = {
  id: string;
  mission_id: string | null;
  submitted_by: string | null;
  description: string;
  urgency: "urgent" | "standard";
  source: "team" | "iris";
  status: "pending" | "decided" | "delegated" | "needs_context";
  decision_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDueDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysTo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function healthScoreFromString(h: string | null): { score: number | null; tone: "red" | "yellow" | "green" | "muted" } {
  const v = (h ?? "").toLowerCase();
  if (v === "red") return { score: 50, tone: "red" };
  if (v === "yellow") return { score: 70, tone: "yellow" };
  if (v === "green") return { score: 90, tone: "green" };
  return { score: null, tone: "muted" };
}

export function StrategicOlympus({ canSubmitDecisions, canResolveDecisions }: {
  canSubmitDecisions: boolean;
  canResolveDecisions: boolean;
}) {
  const qc = useQueryClient();
  const [pipelineTab, setPipelineTab] = useState<"active" | "setup" | "submitted" | "awarded">("active");
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  // ── Missions ─────────────────────────────────────────────
  const { data: missions = [] } = useQuery({
    queryKey: ["olympus-strategic-missions"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("missions")
        .select("id,name,client,status,health,submission_date")
        .order("submission_date", { ascending: true, nullsFirst: false });
      return (data ?? []) as Mission[];
    },
  });

  const { data: intel = [] } = useQuery({
    queryKey: ["olympus-portfolio-intel"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("iris_portfolio_intelligence")
        .select("id,type,headline,body,affected_mission_ids,action_label,action_filter,generated_at")
        .is("dismissed_at", null)
        .order("generated_at", { ascending: false })
        .limit(5);
      return (data ?? []) as PortfolioIntel[];
    },
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["olympus-decisions"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("executive_decisions")
        .select("id,mission_id,submitted_by,description,urgency,source,status,decision_note,created_at,resolved_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return (data ?? []) as ExecDecision[];
    },
  });

  // ── Counts & buckets ─────────────────────────────────────
  const buckets = useMemo(() => {
    const active = missions.filter((m) => (m.status ?? "Active").toLowerCase() === "active");
    const setup = missions.filter((m) => ["draft", "setup"].includes((m.status ?? "").toLowerCase()));
    const submitted = missions.filter((m) => (m.status ?? "").toLowerCase() === "submitted");
    const awarded = missions.filter((m) => ["awarded", "lost", "closed"].includes((m.status ?? "").toLowerCase()));
    let critical = 0, atRisk = 0, onTrack = 0;
    for (const m of active) {
      const v = (m.health ?? "").toLowerCase();
      if (v === "red") critical++;
      else if (v === "yellow") atRisk++;
      else if (v === "green") onTrack++;
    }
    return { active, setup, submitted, awarded, critical, atRisk, onTrack };
  }, [missions]);

  const visibleMissions = useMemo(() => {
    const map = { active: buckets.active, setup: buckets.setup, submitted: buckets.submitted, awarded: buckets.awarded };
    const rows = [...(map[pipelineTab] ?? [])];
    rows.sort((a, b) => {
      const sa = healthScoreFromString(a.health).score ?? 999;
      const sb = healthScoreFromString(b.health).score ?? 999;
      return sa - sb;
    });
    return rows;
  }, [buckets, pipelineTab]);

  const nearest = useMemo(() => {
    const withDates = buckets.active.filter((m) => m.submission_date).sort(
      (a, b) => new Date(a.submission_date!).getTime() - new Date(b.submission_date!).getTime(),
    );
    return withDates[0] ?? null;
  }, [buckets.active]);

  const latestIntelTime = intel[0]?.generated_at ?? null;

  // ── Decisions split ──────────────────────────────────────
  const pendingDecisions = decisions.filter((d) => d.status === "pending");
  const resolvedDecisions = decisions.filter((d) => d.status !== "pending");

  const updateStatus = useMutation({
    mutationFn: async (input: { id: string; status: ExecDecision["status"]; note?: string }) => {
      const { error } = await (supabase as any)
        .from("executive_decisions")
        .update({
          status: input.status,
          decision_note: input.note ?? null,
          resolved_at: input.status === "pending" ? null : new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["olympus-decisions"] });
      toast.success("Decision updated");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update"),
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#060b14" }}>
      <div className="mx-auto max-w-[1200px] px-8 pt-8 pb-16 space-y-8">
        {/* HEADER */}
        <header className="space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                to="/home"
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-3"
              >
                <ArrowLeft className="h-3 w-3" /> Atrium
              </Link>
              <h1 className="text-[34px] font-extrabold tracking-[-0.02em] leading-none">OLYMPUS</h1>
              <p className="mt-1 text-[12px] uppercase tracking-[0.28em] text-muted-foreground">
                Strategic Portfolio View
              </p>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <div>
                <span className="font-bold uppercase tracking-[0.18em]" style={{ color: IRIS_INDIGO }}>⚡ IRIS</span>{" "}
                · Last analyzed: {timeAgo(latestIntelTime)}
              </div>
              {nearest && (
                <div className="mt-1">
                  Nearest submission: <span className="text-foreground/80">{nearest.name}</span>
                  {nearest.submission_date && (
                    <> · {daysTo(nearest.submission_date)}d</>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <span className="text-muted-foreground">
              <span className="text-foreground font-semibold">{buckets.active.length}</span> Active Missions
            </span>
            <span className="text-muted-foreground">·</span>
            <Link to="/home" search={{ healthFilter: "red" } as any} className="hover:underline">
              <span className="text-destructive">●{buckets.critical} Critical</span>
            </Link>
            <Link to="/home" search={{ healthFilter: "yellow" } as any} className="hover:underline">
              <span className="text-amber-400">●{buckets.atRisk} At Risk</span>
            </Link>
            <Link to="/home" search={{ healthFilter: "green" } as any} className="hover:underline">
              <span className="text-emerald-400">●{buckets.onTrack} On Track</span>
            </Link>
          </div>
        </header>

        {/* IRIS PORTFOLIO INTELLIGENCE */}
        <section
          className="rounded-[12px] p-5"
          style={{ background: `${IRIS_INDIGO}10`, border: `1px solid ${IRIS_INDIGO}33` }}
        >
          <header className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[12px] font-bold uppercase tracking-[0.24em]" style={{ color: IRIS_INDIGO }}>
                <Zap className="inline h-3.5 w-3.5 mr-1.5" /> IRIS PORTFOLIO INTELLIGENCE
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Cross-mission patterns · Updated {timeAgo(latestIntelTime)}
              </p>
            </div>
          </header>
          {intel.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cross-mission patterns detected — portfolio health is consistent across all missions.
            </p>
          ) : (
            <ul className="space-y-4">
              {intel.map((it) => (
                <PortfolioIntelItem key={it.id} item={it} />
              ))}
            </ul>
          )}
        </section>

        {/* PIPELINE TABS */}
        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground mb-3">
            Pursuit Pipeline
          </h2>
          <div className="flex flex-wrap items-center gap-1 rounded-[10px] p-1 mb-4"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <PipelineTab active={pipelineTab === "active"} onClick={() => setPipelineTab("active")}>
              Active ({buckets.active.length})
            </PipelineTab>
            <PipelineTab active={pipelineTab === "setup"} onClick={() => setPipelineTab("setup")}>
              Setup ({buckets.setup.length})
            </PipelineTab>
            <PipelineTab active={pipelineTab === "submitted"} onClick={() => setPipelineTab("submitted")}>
              Submitted ({buckets.submitted.length})
            </PipelineTab>
            <PipelineTab active={pipelineTab === "awarded"} onClick={() => setPipelineTab("awarded")}>
              Awarded / Lost ({buckets.awarded.length})
            </PipelineTab>
          </div>

          {/* MISSION MATRIX */}
          <div className="rounded-[10px] overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="grid grid-cols-[1fr_180px_100px_100px_100px_110px] gap-3 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground"
              style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>Mission</div>
              <div>Client</div>
              <div>Health</div>
              <div>Due</div>
              <div>Status</div>
              <div>Cockpit</div>
            </div>
            {visibleMissions.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                {pipelineTab === "awarded"
                  ? "No awarded or lost missions recorded yet."
                  : "No missions in this stage."}
              </div>
            ) : (
              <ul>
                {visibleMissions.map((m) => (
                  <MatrixRow key={m.id} m={m} />
                ))}
              </ul>
            )}
          </div>

          {pipelineTab === "active" && buckets.submitted.length > 0 && (
            <button
              onClick={() => setShowSubmitted((s) => !s)}
              className="mt-3 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showSubmitted ? "Hide" : "Show"} Submitted ({buckets.submitted.length})
            </button>
          )}
          {pipelineTab === "active" && showSubmitted && (
            <div className="mt-2 opacity-60">
              <ul>
                {buckets.submitted.map((m) => (
                  <MatrixRow key={m.id} m={m} muted />
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ORGANIZATIONAL CAPABILITY */}
        <OrganizationalCapability activeMissions={buckets.active} />

        {/* KEY DECISIONS */}
        <section
          className="rounded-[12px] p-5"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <header className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[12px] font-bold uppercase tracking-[0.24em]">Key Decisions</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Items requiring Executive Sponsor input
              </p>
            </div>
            {canSubmitDecisions && (
              <button
                onClick={() => setSubmitOpen((s) => !s)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover"
              >
                <Plus className="h-3 w-3" /> Submit
              </button>
            )}
          </header>

          {submitOpen && (
            <SubmitDecisionForm
              missions={buckets.active}
              onClose={() => setSubmitOpen(false)}
              onSubmitted={() => qc.invalidateQueries({ queryKey: ["olympus-decisions"] })}
            />
          )}

          {pendingDecisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No decisions pending — your team has not surfaced any items requiring your input.
            </p>
          ) : (
            <ul className="space-y-3">
              {pendingDecisions.map((d) => (
                <DecisionRow
                  key={d.id}
                  d={d}
                  missions={missions}
                  canResolve={canResolveDecisions}
                  onUpdate={(status, note) => updateStatus.mutate({ id: d.id, status, note })}
                />
              ))}
            </ul>
          )}

          {resolvedDecisions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setShowResolved((s) => !s)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                {showResolved ? "Hide" : "Show"} Resolved ({resolvedDecisions.length})
              </button>
              {showResolved && (
                <ul className="mt-3 space-y-2 opacity-70">
                  {resolvedDecisions.map((d) => (
                    <li key={d.id} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold capitalize">{d.status.replace("_", " ")}</span>
                        <span className="text-muted-foreground">· {timeAgo(d.resolved_at)}</span>
                      </div>
                      <div className="text-foreground/80 mt-1">{d.description}</div>
                      {d.decision_note && (
                        <div className="text-muted-foreground mt-1 italic">"{d.decision_note}"</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─────────────── Subcomponents ─────────────── */

function PortfolioIntelItem({ item }: { item: PortfolioIntel }) {
  const meta: Record<PortfolioIntel["type"], { emoji: string; label: string; color: string }> = {
    org_risk: { emoji: "🔴", label: "ORGANIZATIONAL RISK", color: "#ef4444" },
    capacity: { emoji: "🟡", label: "CAPACITY SIGNAL", color: "#eab308" },
    opportunity: { emoji: "🔵", label: "STRATEGIC OPPORTUNITY", color: IRIS_INDIGO },
    positive: { emoji: "🟢", label: "POSITIVE SIGNAL", color: "#22c55e" },
  };
  const m = meta[item.type];
  return (
    <li
      className="rounded-md p-3"
      style={{
        background: "rgba(0,0,0,0.18)",
        borderLeft: `3px solid ${m.color}`,
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: m.color }}>
        {m.emoji} {m.label}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-foreground">{item.headline}</div>
      <p className="mt-1 text-[13px] text-foreground/75 leading-[1.55]">{item.body}</p>
      {item.action_label && (
        <Link
          to="/home"
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
          style={{ color: IRIS_INDIGO }}
        >
          {item.action_label} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </li>
  );
}

function PipelineTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors"
      style={{
        background: active ? "rgba(245,158,11,0.12)" : "transparent",
        border: active ? "1px solid rgba(245,158,11,0.35)" : "1px solid transparent",
        color: active ? "var(--athena-gold, #f59e0b)" : "var(--muted-foreground)",
      }}
    >
      {children}
    </button>
  );
}

function MatrixRow({ m, muted }: { m: Mission; muted?: boolean }) {
  const { score, tone } = healthScoreFromString(m.health);
  const dueDays = daysTo(m.submission_date);
  const submitted = (m.status ?? "").toLowerCase() === "submitted";
  const healthEmoji = submitted ? "✓" : tone === "red" ? "🔴" : tone === "yellow" ? "🟡" : tone === "green" ? "🟢" : "⚪";
  const healthText = submitted ? "—" : score !== null ? `${score}%` : "—";
  const dueColor = dueDays === null ? "text-muted-foreground"
    : dueDays < 7 ? "text-destructive"
    : dueDays <= 14 ? "text-amber-400"
    : "text-foreground/80";
  return (
    <li>
      <Link
        to="/missions/$missionId"
        params={{ missionId: m.id }}
        className={`grid grid-cols-[1fr_180px_100px_100px_100px_110px] gap-3 px-4 py-3 text-sm hover:bg-white/[0.03] border-t border-white/[0.04] ${
          muted ? "opacity-70" : ""
        }`}
      >
        <div className="font-medium truncate">{m.name}</div>
        <div className="text-muted-foreground truncate">{m.client ?? "—"}</div>
        <div className="flex items-center gap-1.5">
          <span>{healthEmoji}</span>
          <span className="text-foreground/85">{healthText}</span>
        </div>
        <div className={dueColor}>{fmtDueDate(m.submission_date)}</div>
        <div className="text-muted-foreground capitalize">{m.status ?? "Active"}</div>
        <div className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--athena-gold, #f59e0b)" }}>
          Open <ArrowRight className="h-3 w-3" />
        </div>
      </Link>
    </li>
  );
}

function OrganizationalCapability({ activeMissions }: { activeMissions: Mission[] }) {
  const missionIds = activeMissions.map((m) => m.id);
  const { data: capability } = useQuery({
    queryKey: ["olympus-capability", missionIds.sort().join(",")],
    queryFn: async () => {
      if (missionIds.length === 0) {
        return { writerCounts: {} as Record<string, number>, smeCounts: {} as Record<string, Set<string>>, totalAssigned: 0 };
      }
      const { data } = await (supabase as any)
        .from("questions")
        .select("assigned_writer_id,assigned_sme_id,mission_id")
        .in("mission_id", missionIds);
      const rows = (data ?? []) as Array<{ assigned_writer_id: string | null; assigned_sme_id: string | null; mission_id: string }>;
      const writerCounts: Record<string, number> = {};
      const smeMissions: Record<string, Set<string>> = {};
      let totalAssigned = 0;
      for (const r of rows) {
        if (r.assigned_writer_id) {
          writerCounts[r.assigned_writer_id] = (writerCounts[r.assigned_writer_id] ?? 0) + 1;
          totalAssigned++;
        }
        if (r.assigned_sme_id) {
          if (!smeMissions[r.assigned_sme_id]) smeMissions[r.assigned_sme_id] = new Set();
          smeMissions[r.assigned_sme_id].add(r.mission_id);
        }
      }
      return { writerCounts, smeCounts: smeMissions, totalAssigned };
    },
  });

  const writerCount = Object.keys(capability?.writerCounts ?? {}).length;
  const overloadedWriters = Object.values(capability?.writerCounts ?? {}).filter((c) => c >= 9).length;
  const sharedSmes = Object.values(capability?.smeCounts ?? {}).filter((s) => s.size >= 3).length;
  const avgPerWriter = writerCount > 0 ? ((capability?.totalAssigned ?? 0) / writerCount).toFixed(1) : "—";
  const contributorCount = writerCount + Object.keys(capability?.smeCounts ?? {}).length;

  return (
    <section
      className="rounded-[12px] p-5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <h2 className="text-[12px] font-bold uppercase tracking-[0.24em] mb-4">Organizational Capability</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
            <Users className="inline h-3 w-3 mr-1" /> Team Utilization
          </div>
          <dl className="space-y-1.5 text-sm">
            <Stat label="Active contributors" value={String(contributorCount)} />
            <Stat label="Sections assigned" value={String(capability?.totalAssigned ?? 0)} />
            <Stat label="Avg sections per writer" value={avgPerWriter} />
          </dl>
          {(overloadedWriters > 0 || sharedSmes > 0) && (
            <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[12px] text-amber-300">
              <AlertTriangle className="inline h-3 w-3 mr-1" /> At-risk capacity:
              {overloadedWriters > 0 && <div>· {overloadedWriters} writer(s) have 9+ sections</div>}
              {sharedSmes > 0 && <div>· {sharedSmes} SME(s) shared across 3+ missions</div>}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-2">
            Expertise Coverage
          </div>
          <p className="text-sm text-muted-foreground">
            Expertise profiles will surface here once team members complete their profiles.
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function DecisionRow({ d, missions, canResolve, onUpdate }: {
  d: ExecDecision;
  missions: Mission[];
  canResolve: boolean;
  onUpdate: (status: ExecDecision["status"], note?: string) => void;
}) {
  const mission = missions.find((m) => m.id === d.mission_id);
  const dotColor = d.urgency === "urgent" ? "#ef4444" : "#eab308";
  const isIris = d.source === "iris";
  return (
    <li
      className="rounded-md p-3"
      style={{
        background: isIris ? `${IRIS_INDIGO}0F` : "rgba(255,255,255,0.02)",
        border: `1px solid ${isIris ? `${IRIS_INDIGO}33` : "rgba(255,255,255,0.06)"}`,
        borderLeft: `3px solid ${dotColor}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground">
            {mission ? <span className="text-foreground/85 font-medium">{mission.name}</span> : <span className="italic">Portfolio-level</span>}
            {" · "}
            {isIris ? (
              <span style={{ color: IRIS_INDIGO }} className="font-semibold">⚡ IRIS recommendation</span>
            ) : (
              <span>Submitted by team</span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-foreground/90">{d.description}</p>
        </div>
        <div className="text-right text-[11px] text-muted-foreground shrink-0">
          {timeAgo(d.created_at)}
          {d.urgency === "urgent" && (
            <div className="text-destructive font-semibold uppercase tracking-wider">Urgent</div>
          )}
        </div>
      </div>
      {canResolve && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => onUpdate("decided", window.prompt("Decision note (optional):") ?? undefined)}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/[0.08] px-2.5 py-1 text-[11px] text-emerald-300 hover:bg-emerald-500/[0.15]"
          >
            <Check className="h-3 w-3" /> Decided
          </button>
          <button
            onClick={() => onUpdate("delegated")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] hover:bg-white/[0.08]"
          >
            Delegated
          </button>
          <button
            onClick={() => onUpdate("needs_context")}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] hover:bg-white/[0.08]"
          >
            Needs more context
          </button>
        </div>
      )}
    </li>
  );
}

function SubmitDecisionForm({ missions, onClose, onSubmitted }: {
  missions: Mission[];
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [missionId, setMissionId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<"urgent" | "standard">("standard");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!description.trim()) {
      toast.error("Please describe the decision needed");
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase as any).from("executive_decisions").insert({
        mission_id: missionId || null,
        submitted_by: user.id,
        description: description.trim(),
        urgency,
        source: "team",
        status: "pending",
      });
      if (error) throw error;
      toast.success("Decision submitted");
      setDescription("");
      onSubmitted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to submit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-md border border-white/[0.08] bg-white/[0.03] p-3 space-y-2">
      <div className="flex gap-2">
        <select
          value={missionId}
          onChange={(e) => setMissionId(e.target.value)}
          className="rounded-md border border-white/10 bg-background px-2 py-1.5 text-xs"
        >
          <option value="">Portfolio-level</option>
          {missions.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        <select
          value={urgency}
          onChange={(e) => setUrgency(e.target.value as any)}
          className="rounded-md border border-white/10 bg-background px-2 py-1.5 text-xs"
        >
          <option value="standard">Standard</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the decision the Executive Sponsor needs to make…"
        rows={3}
        className="w-full rounded-md border border-white/10 bg-background px-2.5 py-2 text-sm placeholder:text-muted-foreground/60"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="rounded-md border border-white/10 px-2.5 py-1 text-xs hover:bg-white/5">Cancel</button>
        <button
          onClick={submit}
          disabled={saving}
          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
