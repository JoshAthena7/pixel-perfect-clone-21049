import React from "react";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import {
  Megaphone,
  Users,
  Grid3x3,
  ClipboardList,
  Heart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { LivePresence } from "@/components/war-room/LivePresence";
import { Signal, Siren, Pin } from "lucide-react";
import { relativeTime } from "@/lib/time";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";
import { SnapshotsPanel } from "@/components/war-room/SnapshotsPanel";
import { IntelligenceInsightsPanel } from "@/components/war-room/IntelligenceInsightsPanel";
import { RisksSignalsPanel } from "@/components/war-room/RisksSignalsPanel";
import { SosBanner } from "@/components/war-room/SosBanner";
import { EnvironmentBanner } from "@/components/war-room/EnvironmentBanner";
import { SizingSummaryStrip } from "@/components/sizing/SizingSummaryStrip";
import { PageGate } from "@/components/war-room/PageGate";
import { StrategicIntelFeed } from "@/components/iris/StrategicIntelFeed";


export const Route = createFileRoute("/_authenticated/command")({
  head: () => ({ meta: [{ title: "Overview — Mission" }] }),
  component: CommandCenterGate,
});

function CommandCenterGate() {
  const { loading, can } = useEngagement();
  if (loading) return null;
  // Anyone with at least read access to Mission Control sees it.
  // Writers/SMEs without read access land on their /huddle home.
  if (!can("missionControl")) return <Navigate to="/huddle" replace />;
  return (
    <PageGate page="missionControl">
      <CommandCenter />
    </PageGate>
  );
}


type HeatStatus = "Green" | "Yellow" | "Orange" | "Red";
type Heat = { id: string; section_name: string; status: HeatStatus; sort_order: number };
type Broadcast = { id: string; content: string; author_name: string; created_at: string; pinned: boolean };
type Huddle = {
  id: string;
  health: string;
  priority: string | null;
  risk: string | null;
  client_concern: string | null;
  writer_concern: string | null;
  submitter_name: string;
  created_at: string;
};
type Snapshot = { temperature_score: number; client_sentiment: string | null; created_at: string };

const BORDER = "rgba(255,255,255,0.08)";
const HEAT_COLOR: Record<HeatStatus, string> = {
  Green: "#22c55e",
  Yellow: "#eab308",
  Orange: "#f97316",
  Red: "#ef4444",
};

function tempTier(score: number): { label: string; color: string } {
  if (score <= 30) return { label: "Stable", color: "#22c55e" };
  if (score <= 55) return { label: "Warming", color: "#eab308" };
  if (score <= 75) return { label: "Elevated", color: "#f97316" };
  return { label: "Critical", color: "#ef4444" };
}

function sentimentTier(s: string | null): { label: string; color: string } {
  const v = (s ?? "").toLowerCase();
  if (!v) return { label: "No signal", color: "#64748b" };
  if (v.includes("happy") || v.includes("positive") || v.includes("warm")) return { label: s!, color: "#22c55e" };
  if (v.includes("neutral") || v.includes("mixed")) return { label: s!, color: "#eab308" };
  if (v.includes("concern") || v.includes("frustrat") || v.includes("cold") || v.includes("negative")) return { label: s!, color: "#ef4444" };
  return { label: s!, color: "#94a3b8" };
}

function huddleHealthColor(health: string): string {
  const h = (health || "").toLowerCase();
  if (h.includes("block") || h === "red") return "#ef4444";
  if (h.includes("risk") || h === "yellow" || h === "orange" || h.includes("warn")) return "#f97316";
  return "#22c55e";
}


// ── Role Welcome (shows once per mission per user) ───────────────
function RoleWelcome({ engagementName, role }: { engagementName: string; role: string }) {
  const key = `athena_welcomed_${engagementName}`;
  const [show, setShow] = React.useState(() => !localStorage.getItem(key));

  function dismiss() {
    localStorage.setItem(key, "1");
    setShow(false);
  }

  if (!show) return null;

  const MESSAGES: Record<string, { emoji: string; headline: string; sub: string }> = {
    lead:           { emoji: "🎯", headline: "You're the Engagement Lead.", sub: "Mission Control gives you full situational awareness. IRIS will brief you on what matters." },
    founder:        { emoji: "🎯", headline: "You're the Engagement Lead.", sub: "Mission Control gives you full situational awareness. IRIS will brief you on what matters." },
    engagement_lead:{ emoji: "🎯", headline: "You're the Engagement Lead.", sub: "Mission Control gives you full situational awareness. IRIS will brief you on what matters." },
    pm:             { emoji: "📋", headline: "You're the Project Manager.", sub: "Keep the mission on track. Review open risks and signals. Submit daily check-ins." },
    exec:           { emoji: "👁️", headline: "You're in Executive view.", sub: "Review mission health and leadership signals. IRIS will surface what needs your attention." },
    writer:         { emoji: "✍️", headline: "Welcome to the mission.", sub: "Your sections are in My Sections. Check Mission Intelligence for context on what you're writing." },
    sme:            { emoji: "🔬", headline: "You're the Subject Matter Expert.", sub: "Review Mission Intelligence and contribute your expertise. Your insights shape the proposal." },
    partner:        { emoji: "🤝", headline: "You have guest access.", sub: "You can view the RFP intelligence and reference documents relevant to your involvement." },
  };

  const msg = MESSAGES[role] ?? { emoji: "👋", headline: "Welcome to this mission.", sub: "Explore the sidebar to get started." };

  return (
    <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <span className="text-2xl flex-shrink-0">{msg.emoji}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{msg.headline}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{msg.sub}</p>
      </div>
      <button onClick={dismiss} className="text-muted-foreground hover:text-foreground text-xs flex-shrink-0 mt-0.5">✕</button>
    </div>
  );
}

// ── Quick Action Bar ─────────────────────────────────────────────
function QuickActionBar({ engagementId, memberName }: { engagementId: string; memberName: string }) {
  const [open, setOpen] = useState<"signal"|"sos"|null>(null);
  const [health, setHealth] = useState("Green");
  const [priority, setPriority] = useState("");
  const [desc, setDesc] = useState("");
  const [sev, setSev] = useState("Orange");
  const [saving, setSaving] = useState(false);

  async function submitSignal() {
    if (!priority.trim()) return;
    setSaving(true);
    await supabase.from("huddles").insert({ engagement_id: engagementId, health, priority, submitter_name: memberName || "Team", leadership_needed: false });
    await supabase.from("engagements").update({ health }).eq("id", engagementId);
    setSaving(false); setPriority(""); setOpen(null);
  }

  async function submitSOS() {
    if (!desc.trim()) return;
    setSaving(true);
    await supabase.from("sos_alerts").insert({ engagement_id: engagementId, severity: sev, description: desc, status: "Open", submitted_by: memberName || "Team", submitter_name: memberName || "Team", category: "Other" });
    setSaving(false); setDesc(""); setOpen(null);
  }

  const HEALTH_COLOR: Record<string,string> = { Green:"#22c55e", Yellow:"#f59e0b", Red:"#ef4444" };

  return (
    <div style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)", background: "#111827" }}>
      <div className="flex items-center gap-2 px-5 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Quick actions</span>
        <button
          onClick={() => setOpen(open === "signal" ? null : "signal")}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${open==="signal" ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
        >
          📡 Submit Signal
        </button>
        <button
          onClick={() => setOpen(open === "sos" ? null : "sos")}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${open==="sos" ? "border-red-500 bg-red-500/10 text-red-400" : "border-border/60 text-muted-foreground hover:border-red-500/40 hover:text-red-400"}`}
        >
          🚨 Raise SOS
        </button>
      </div>

      {open === "signal" && (
        <div className="px-5 pb-4 space-y-3 border-t border-border/40 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Health:</span>
            {["Green","Yellow","Red"].map(h => (
              <button key={h} type="button" onClick={() => setHealth(h)}
                className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={{ borderColor: health===h ? HEALTH_COLOR[h] : "rgba(255,255,255,0.15)", color: health===h ? HEALTH_COLOR[h] : "#8b9ab5", background: health===h ? `${HEALTH_COLOR[h]}18` : "transparent" }}>
                {h}
              </button>
            ))}
          </div>
          <input
            className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            placeholder="What's the priority today? (required)"
            value={priority}
            onChange={e => setPriority(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !saving && submitSignal()}
          />
          <div className="flex gap-2">
            <button onClick={() => setOpen(null)} className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={submitSignal} disabled={saving || !priority.trim()}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? "Submitting…" : "Submit Signal"}
            </button>
          </div>
        </div>
      )}

      {open === "sos" && (
        <div className="px-5 pb-4 space-y-3 border-t border-red-500/20 pt-3" style={{ background: "rgba(239,68,68,0.04)" }}>
          <p className="text-xs text-red-400/80">SOS alerts notify leadership immediately. Use for urgent issues only.</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Severity:</span>
            {[["Orange","🟠 Orange"],["Red","🔴 Red"]].map(([v,l]) => (
              <button key={v} type="button" onClick={() => setSev(v)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${sev===v ? (v==="Red"?"border-red-500 text-red-400 bg-red-500/10":"border-orange-500 text-orange-400 bg-orange-500/10") : "border-border/60 text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          <textarea
            className="w-full rounded-md border border-red-500/30 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-red-500 resize-none"
            placeholder="Describe the urgent issue (required)"
            rows={2}
            value={desc}
            onChange={e => setDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={() => setOpen(null)} className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={submitSOS} disabled={saving || !desc.trim()}
              className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? "Submitting…" : "Submit SOS"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onboarding Checklist ──────────────────────────────────────────
function OnboardingChecklist({ engagementId }: { engagementId: string }) {
  const [status, setStatus] = useState({ hasDate: false, hasDoc: false, hasTeam: false, checked: false });

  useEffect(() => {
    (async () => {
      const [eng, docs, members] = await Promise.all([
        supabase.from("engagements").select("submission_date").eq("id", engagementId).single(),
        supabase.from("intel_documents").select("id").eq("engagement_id", engagementId).limit(1),
        supabase.from("engagement_members").select("id").eq("engagement_id", engagementId).limit(3),
      ]);
      setStatus({
        hasDate: !!eng.data?.submission_date,
        hasDoc: (docs.data?.length ?? 0) > 0,
        hasTeam: (members.data?.length ?? 0) > 1,
        checked: true,
      });
    })();
  }, [engagementId]);

  if (!status.checked) return null;
  if (status.hasDate && status.hasDoc && status.hasTeam) return null;

  const steps = [
    { done: status.hasDate, icon: "📅", label: "Set your submission date", sub: "Track days remaining on Mission Control", action: "Go to Settings →", href: "/settings" },
    { done: status.hasDoc, icon: "📄", label: "Upload your first RFP document", sub: "IRIS uses this to generate intelligence", action: "Go to Mission Briefing →", href: "/intel" },
    { done: status.hasTeam, icon: "👥", label: "Invite your first team member", sub: "Writers and PMs see what's relevant to their role", action: "Go to Team →", href: "/section-assignments" },
  ].filter(s => !s.done);

  return (
    <div className="mx-5 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold">Get started</span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">{steps.length} step{steps.length > 1 ? "s" : ""} remaining</span>
      </div>
      <div className="space-y-2">
        {steps.map(s => (
          <a key={s.label} href={s.href} className="flex items-start gap-3 rounded-md border border-border/40 bg-background/50 p-3 hover:border-primary/30 transition-colors no-underline">
            <span className="text-lg flex-shrink-0">{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground">{s.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.sub}</div>
            </div>
            <span className="text-xs text-primary flex-shrink-0 mt-0.5">{s.action}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function PendingDecisionsCount({ engagementId }: { engagementId: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    supabase
      .from("decisions")
      .select("id", { count: "exact", head: true })
      .eq("engagement_id", engagementId)
      .eq("status", "Pending Confirmation")
      .then(({ count: c }) => setCount(c ?? 0));
  }, [engagementId]);
  if (count === null) return <div className="text-3xl font-bold leading-none text-muted-foreground">—</div>;
  return (
    <>
      <div className="text-3xl font-bold leading-none" style={{ color: count > 0 ? "#f59e0b" : "#22c55e" }}>{count}</div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: count > 0 ? "#f59e0b" : "#22c55e" }}>
        {count > 0 ? "Needs Decision" : "All Clear"}
      </div>
    </>
  );
}

function CommandCenter() {
  const { engagement, member } = useEngagement();
  const [heatmap, setHeatmap] = useState<Heat[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [latestHuddle, setLatestHuddle] = useState<Huddle | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<Snapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBroadcasts, setShowBroadcasts] = useState(true);
  const [showHuddle, setShowHuddle] = useState(true);

  async function loadAll(eid: string) {
    setIsLoading(true);
    setLoadError(null);
    const [heat, bc, snap, hud] = await Promise.all([
      supabase.from("heatmap_sections").select("*").eq("engagement_id", eid).order("sort_order"),
      supabase.from("broadcasts").select("*").eq("engagement_id", eid).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5),
      supabase.from("snapshots").select("temperature_score,client_sentiment,created_at").eq("engagement_id", eid).order("snapshot_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("huddles").select("id,health,priority,risk,client_concern,writer_concern,submitter_name,created_at").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setIsLoading(false);
    const firstErr = heat.error ?? bc.error ?? snap.error ?? hud.error;
    if (firstErr) { setLoadError(firstErr.message); return; }
    setHeatmap((heat.data as Heat[]) ?? []);
    setBroadcasts((bc.data as Broadcast[]) ?? []);
    setLatestSnapshot((snap.data as Snapshot | null) ?? null);
    setLatestHuddle((hud.data as Huddle | null) ?? null);
  }

  useEffect(() => {
    if (!engagement) return;
    loadAll(engagement.id);
    const ch = supabase
      .channel(`cmd:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", filter: `engagement_id=eq.${engagement.id}` }, () => loadAll(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  if (!engagement) return null;

  const temperature = latestSnapshot?.temperature_score ?? 0;
  const tier = tempTier(temperature);
  const sentiment = sentimentTier(latestSnapshot?.client_sentiment ?? null);

  return (
    <div className="w-full">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 px-5 py-3" style={{ borderBottom: `0.5px solid ${BORDER}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium truncate">{engagement.name}</span>
          {(engagement as { health?: string }).health && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              style={{
                color: huddleHealthColor((engagement as { health?: string }).health || ""),
                background: `color-mix(in oklab, ${huddleHealthColor((engagement as { health?: string }).health || "")} 14%, transparent)`,
                border: `0.5px solid color-mix(in oklab, ${huddleHealthColor((engagement as { health?: string }).health || "")} 45%, transparent)`,
              }}
              title="Auto-derived from latest huddle"
            >
              {(engagement as { health?: string }).health}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <SnapshotsPanel />
          <span className="hidden text-[11px] uppercase tracking-wider text-muted-foreground sm:inline">Online now</span>
          <LivePresence variant="compact" />
        </div>
      </header>

      <QuickActionBar engagementId={engagement.id} memberName={member?.display_name ?? ""} />
      <RoleWelcome engagementName={engagement.name} role={member?.role ?? ""} />

      <div className="px-5 pt-4 space-y-4">
        <ErrorBanner error={loadError} onRetry={() => engagement && loadAll(engagement.id)} label="Couldn't load command center data." />
        {isLoading && heatmap.length === 0 && <LoadingSkeleton label="Loading command center…" />}

        <EnvironmentBanner env="mission" />
        {/* ZONE 0 — SOS (only renders when active SOS exists) */}
        <SosBanner />
        {/* IRIS Strategic Intelligence Feed */}
        <StrategicIntelFeed engagementId={engagement.id} canRegenerate={canEdit("missionControl")} />

        {/* ONBOARDING — shows until mission is set up */}
        <OnboardingChecklist engagementId={engagement.id} />

        {/* ZONE 1 — Intelligence Insights */}
        <IntelligenceInsightsPanel />
        <RisksSignalsPanel />

        {/* ZONE 2 — Health strip: three blocks */}
        <section
          className="grid grid-cols-1 md:grid-cols-3 rounded-lg overflow-hidden"
          style={{ border: `0.5px solid ${BORDER}`, background: "#1a2333" }}
        >
          {/* Section health pips */}
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Grid3x3 className="h-3.5 w-3.5" /> Section Health
            </div>
            {heatmap.length === 0 ? (
              <div className="text-[12px] text-muted-foreground">No sections yet</div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {heatmap.map((h) => {
                    const c = HEAT_COLOR[h.status] ?? HEAT_COLOR.Green;
                    return (
                      <div key={h.id} className="flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                          style={{ background: c, boxShadow: `0 0 0 0.5px color-mix(in oklab, ${c} 60%, transparent)` }}
                        />
                        <span className="text-[10px] text-muted-foreground">{h.section_name}</span>
                      </div>
                    );
                  })}
                </div>
                <Link to="/heatmap" className="mt-3 inline-block text-[11px] text-primary hover:underline">View section detail →</Link>
              </>
            )}
          </div>

          {/* Pending Decisions */}
          <div className="p-5" style={{ borderLeft: `0.5px solid ${BORDER}` }}>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" /> Pending Decisions
            </div>
            <PendingDecisionsCount engagementId={engagement.id} />
          </div>

          {/* Client sentiment */}
          <div className="p-5" style={{ borderLeft: `0.5px solid ${BORDER}` }}>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Heart className="h-3.5 w-3.5" /> Client Sentiment
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: sentiment.color }} />
              <span className="text-base font-semibold capitalize" style={{ color: sentiment.color }}>{sentiment.label}</span>
            </div>
            <Link to="/pulse" className="mt-3 inline-block text-[11px] text-primary hover:underline">View pulse →</Link>
          </div>
        </section>

        {/* ZONE 3 — Collapsed broadcasts + latest huddle */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
          {/* Broadcasts card */}
          <div className="rounded-lg" style={{ border: `0.5px solid ${BORDER}`, background: "#1a2333" }}>
            <button
              type="button"
              onClick={() => setShowBroadcasts((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <Megaphone className="h-3.5 w-3.5" /> Broadcasts · {broadcasts.length}
              </div>
              {showBroadcasts ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showBroadcasts && (
              <div className="px-4 pb-4 space-y-2" style={{ borderTop: `0.5px solid ${BORDER}` }}>
                {broadcasts.length === 0 ? (
                  <div className="pt-3 text-[12px] text-muted-foreground">No recent broadcasts</div>
                ) : (
                  <ul className="pt-3 space-y-2">
                    {broadcasts.map((b) => (
                      <li key={b.id} className="rounded-md px-3 py-2" style={{ background: "#0f1827", border: `0.5px solid ${BORDER}` }}>
                        <div className="flex items-start gap-2">
                          <span className="text-base leading-none">{b.pinned ? "📌" : "📣"}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-medium text-white line-clamp-2">{b.content}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">{b.author_name} · {relativeTime(b.created_at)}</div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Link to="/broadcasts" className="inline-block pt-1 text-[11px] text-primary hover:underline">All broadcasts →</Link>
              </div>
            )}
          </div>

          {/* Latest huddle card */}
          <div className="rounded-lg" style={{ border: `0.5px solid ${BORDER}`, background: "#1a2333" }}>
            <button
              type="button"
              onClick={() => setShowHuddle((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Latest Team Signal
                {latestHuddle && (
                  <span className="ml-2 text-[11px] text-muted-foreground normal-case tracking-normal">
                    {latestHuddle.submitter_name} · {relativeTime(latestHuddle.created_at)}
                  </span>
                )}
              </div>
              {showHuddle ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showHuddle && (
              <div className="px-4 pb-4" style={{ borderTop: `0.5px solid ${BORDER}` }}>
                {!latestHuddle ? (
                  <div className="pt-3 text-[12px] text-muted-foreground">No huddles yet</div>
                ) : (
                  <div className="pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: huddleHealthColor(latestHuddle.health) }} />
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5"
                        style={{
                          color: huddleHealthColor(latestHuddle.health),
                          background: `color-mix(in oklab, ${huddleHealthColor(latestHuddle.health)} 14%, transparent)`,
                          border: `0.5px solid color-mix(in oklab, ${huddleHealthColor(latestHuddle.health)} 45%, transparent)`,
                        }}
                      >
                        {(latestHuddle.health || "").toUpperCase()}
                      </span>
                    </div>
                    {latestHuddle.priority && <div className="text-[12px]"><span className="text-muted-foreground">Priority: </span>{latestHuddle.priority}</div>}
                    {latestHuddle.risk && <div className="text-[12px]"><span className="text-muted-foreground">Risk: </span>{latestHuddle.risk}</div>}
                    {latestHuddle.client_concern && <div className="text-[12px]"><span className="text-muted-foreground">Client: </span>{latestHuddle.client_concern}</div>}
                    {latestHuddle.writer_concern && <div className="text-[12px]"><span className="text-muted-foreground">Writer: </span>{latestHuddle.writer_concern}</div>}
                    <Link to="/huddle" className="inline-block pt-1 text-[11px] text-primary hover:underline">Open Huddle →</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
