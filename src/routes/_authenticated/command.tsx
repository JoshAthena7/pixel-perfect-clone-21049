/**
 * MISSION OVERVIEW — /command
 *
 * ARCHITECTURE: Mission environment (Execute)
 * This page contains ONLY operational execution content:
 *   - Mission health indicators
 *   - Quick actions (signal, SOS, broadcast)
 *   - IRIS strategic intelligence feed
 *   - Section health map
 *   - Question health summary
 *   - Latest signals and broadcasts
 *   - Mission Spotlight
 *
 * DO NOT ADD to this page:
 *   - Onboarding inputs (belong in Mission Control → Configuration)
 *   - RFP upload fields (belong in Mission Control → Documents)
 *   - Team setup (belong in Mission Control → Configuration)
 *   - Mission activation (belong in Mission Control)
 *   - Intelligence management (belongs in Mission Control → Mission Brain)
 */

import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import {
  Megaphone,
  Users,
  Grid3x3,
  Heart,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from "lucide-react";
import { LivePresence } from "@/components/war-room/LivePresence";
import { relativeTime } from "@/lib/time";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";
import { SnapshotsPanel } from "@/components/war-room/SnapshotsPanel";
import { SosBanner } from "@/components/war-room/SosBanner";
import { MissionSpotlight } from "@/components/war-room/MissionSpotlight";
import { PageGate } from "@/components/war-room/PageGate";
import { StrategicIntelFeed } from "@/components/iris/StrategicIntelFeed";

export const Route = createFileRoute("/_authenticated/command")({
  head: () => ({ meta: [{ title: "Overview — Mission" }] }),
  component: CommandCenterGate,
});

function CommandCenterGate() {
  const { loading, can } = useEngagement();
  if (loading) return null;
  if (!can("missionControl")) return <Navigate to="/huddle" replace />;
  return (
    <PageGate page="missionControl">
      <CommandCenter />
    </PageGate>
  );
}

// ── Types ─────────────────────────────────────────────────────────
type HeatStatus = "Green" | "Yellow" | "Orange" | "Red";
type Heat = { id: string; section_name: string; status: HeatStatus; sort_order: number };
type Broadcast = { id: string; content: string; author_name: string; created_at: string; pinned: boolean };
type Huddle = { id: string; health: string; priority: string | null; risk: string | null; client_concern: string | null; writer_concern: string | null; submitter_name: string; created_at: string };

const BORDER = "rgba(255,255,255,0.08)";
const HEAT_COLOR: Record<HeatStatus, string> = {
  Green: "#22c55e", Yellow: "#eab308", Orange: "#f97316", Red: "#ef4444",
};

function healthColor(h: string) {
  const v = h?.toLowerCase();
  if (v === "red" || v?.includes("block")) return "#ef4444";
  if (v === "orange" || v === "yellow" || v?.includes("risk") || v?.includes("warn")) return "#f97316";
  return "#22c55e";
}

function sentimentColor(s: string | null) {
  const v = (s ?? "").toLowerCase();
  if (!v) return "#64748b";
  if (v.includes("happy") || v.includes("positive") || v.includes("warm") || v === "aligned") return "#22c55e";
  if (v.includes("concern") || v.includes("frustrat") || v === "at risk" || v === "negative") return "#ef4444";
  return "#f59e0b";
}

// ── Question Health Summary (clickable metric cell) ───────────────
function QuestionHealthSummary({ engagementId }: { engagementId: string }) {
  const [counts, setCounts] = useState<{ critical: number; red: number; yellow: number; total: number } | null>(null);

  useEffect(() => {
    supabase.from("rfp_questions").select("health").eq("engagement_id", engagementId)
      .then(({ data }) => {
        if (!data?.length) return;
        const c = { critical: 0, red: 0, yellow: 0, total: data.length };
        data.forEach((q: any) => {
          if (q.health === "Critical") c.critical++;
          else if (q.health === "Red") c.red++;
          else if (q.health === "Yellow") c.yellow++;
        });
        setCounts(c);
      });
  }, [engagementId]);

  if (!counts || counts.total === 0) {
    return <div className="text-[12px] text-muted-foreground">No questions loaded yet</div>;
  }

  const atRisk = counts.critical + counts.red;
  const color = atRisk > 0 ? "#ef4444" : counts.yellow > 0 ? "#f59e0b" : "#22c55e";

  return (
    <>
      <div className="text-3xl font-bold leading-none" style={{ color }}>{atRisk > 0 ? atRisk : counts.total}</div>
      <div className="mt-1.5 text-[11px] text-muted-foreground">
        {atRisk > 0 ? `of ${counts.total} need attention` : "questions healthy"}
      </div>
    </>
  );
}

// ── Quick Action Bar — operational signals only ───────────────────
function QuickActionBar({ engagementId, memberName }: { engagementId: string; memberName: string }) {
  const [open, setOpen] = useState<"signal" | "sos" | "broadcast" | null>(null);
  const [health, setHealth] = useState("Green");
  const [priority, setPriority] = useState("");
  const [desc, setDesc] = useState("");
  const [broadcastText, setBroadcastText] = useState("");
  const [sev, setSev] = useState("Orange");
  const [saving, setSaving] = useState(false);

  const HEALTH_COLOR: Record<string, string> = { Green: "#22c55e", Yellow: "#f59e0b", Red: "#ef4444" };

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

  async function submitBroadcast() {
    if (!broadcastText.trim()) return;
    setSaving(true);
    await supabase.from("broadcasts").insert({ engagement_id: engagementId, content: broadcastText, author_name: memberName || "Leadership" });
    setSaving(false); setBroadcastText(""); setOpen(null);
  }

  return (
    <div style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)", background: "#111827" }}>
      <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mr-1">Quick actions</span>
        <button onClick={() => setOpen(open === "signal" ? null : "signal")}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${open === "signal" ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
          📡 Submit Signal
        </button>
        <button onClick={() => setOpen(open === "sos" ? null : "sos")}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${open === "sos" ? "border-red-500 bg-red-500/10 text-red-400" : "border-border/60 text-muted-foreground hover:border-red-500/40 hover:text-red-400"}`}>
          🚨 Raise SOS
        </button>
        <button onClick={() => setOpen(open === "broadcast" ? null : "broadcast")}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${open === "broadcast" ? "border-amber-500/60 bg-amber-500/10 text-amber-400" : "border-border/60 text-muted-foreground hover:border-amber-500/30 hover:text-amber-300"}`}>
          📣 Broadcast
        </button>
      </div>

      {open === "signal" && (
        <div className="px-5 pb-4 space-y-3 border-t border-border/40 pt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Health:</span>
            {["Green", "Yellow", "Red"].map(h => (
              <button key={h} type="button" onClick={() => setHealth(h)}
                className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                style={{ borderColor: health === h ? HEALTH_COLOR[h] : "rgba(255,255,255,0.15)", color: health === h ? HEALTH_COLOR[h] : "#8b9ab5", background: health === h ? `${HEALTH_COLOR[h]}18` : "transparent" }}>
                {h}
              </button>
            ))}
          </div>
          <input className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            placeholder="What's the priority today? (required)" value={priority}
            onChange={e => setPriority(e.target.value)} onKeyDown={e => e.key === "Enter" && !saving && submitSignal()} />
          <div className="flex gap-2">
            <button onClick={() => setOpen(null)} className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground">Cancel</button>
            <button onClick={submitSignal} disabled={saving || !priority.trim()} className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
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
            {[["Orange", "🟠 Orange"], ["Red", "🔴 Red"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setSev(v)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${sev === v ? (v === "Red" ? "border-red-500 text-red-400 bg-red-500/10" : "border-orange-500 text-orange-400 bg-orange-500/10") : "border-border/60 text-muted-foreground"}`}>{l}</button>
            ))}
          </div>
          <textarea className="w-full rounded-md border border-red-500/30 bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-red-500 resize-none"
            placeholder="Describe the urgent issue (required)" rows={2} value={desc} onChange={e => setDesc(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setOpen(null)} className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground">Cancel</button>
            <button onClick={submitSOS} disabled={saving || !desc.trim()} className="rounded-md bg-red-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? "Submitting…" : "Submit SOS"}
            </button>
          </div>
        </div>
      )}

      {open === "broadcast" && (
        <div className="px-5 pb-4 space-y-3 border-t border-border/40 pt-3">
          <p className="text-xs text-muted-foreground">Publish direction or updates to the full team.</p>
          <textarea className="w-full rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary resize-none"
            placeholder="Share strategic guidance, focus areas, or client direction…" rows={3} value={broadcastText} onChange={e => setBroadcastText(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={() => setOpen(null)} className="rounded-md border border-border/40 px-3 py-1.5 text-xs text-muted-foreground">Cancel</button>
            <button onClick={submitBroadcast} disabled={saving || !broadcastText.trim()} className="rounded-md bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Mission Overview ─────────────────────────────────────────
function CommandCenter() {
  const { engagement, member, canEdit } = useEngagement();
  const [heatmap, setHeatmap] = useState<Heat[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [latestHuddle, setLatestHuddle] = useState<Huddle | null>(null);
  const [clientSentiment, setClientSentiment] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBroadcasts, setShowBroadcasts] = useState(true);
  const [showHuddle, setShowHuddle] = useState(true);

  async function loadAll(eid: string) {
    setIsLoading(true);
    setLoadError(null);
    const [heat, bc, hud, pulse] = await Promise.all([
      supabase.from("heatmap_sections").select("*").eq("engagement_id", eid).order("sort_order"),
      supabase.from("broadcasts").select("*").eq("engagement_id", eid).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5),
      supabase.from("huddles").select("id,health,priority,risk,client_concern,writer_concern,submitter_name,created_at").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("alignment_signals").select("sentiment").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setIsLoading(false);
    const firstErr = heat.error ?? bc.error ?? hud.error;
    if (firstErr) { setLoadError(firstErr.message); return; }
    setHeatmap((heat.data as Heat[]) ?? []);
    setBroadcasts((bc.data as Broadcast[]) ?? []);
    setLatestHuddle((hud.data as Huddle | null) ?? null);
    setClientSentiment((pulse.data as any)?.sentiment ?? null);
  }

  useEffect(() => {
    if (!engagement) return;
    loadAll(engagement.id);
    const ch = supabase.channel(`cmd:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", filter: `engagement_id=eq.${engagement.id}` }, () => loadAll(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  if (!engagement) return null;

  const sentColor = sentimentColor(clientSentiment);
  const mHealth = (engagement as any).health ?? "Green";

  return (
    <div className="w-full">
      {/* Mission header */}
      <header className="flex items-center justify-between gap-4 px-5 py-3" style={{ borderBottom: `0.5px solid ${BORDER}` }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium truncate">{engagement.name}</span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: healthColor(mHealth), background: `color-mix(in oklab, ${healthColor(mHealth)} 14%, transparent)`, border: `0.5px solid color-mix(in oklab, ${healthColor(mHealth)} 45%, transparent)` }}>
            {mHealth}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SnapshotsPanel />
          <span className="hidden text-[11px] uppercase tracking-wider text-muted-foreground sm:inline">Online now</span>
          <LivePresence variant="compact" />
        </div>
      </header>

      {/* Quick actions — operational only */}
      <QuickActionBar engagementId={engagement.id} memberName={member?.display_name ?? ""} />

      <div className="px-5 pt-4 space-y-4">
        <ErrorBanner error={loadError} onRetry={() => engagement && loadAll(engagement.id)} label="Couldn't load mission data." />
        {isLoading && heatmap.length === 0 && <LoadingSkeleton label="Loading mission overview…" />}

        {/* Active SOS — operational alert */}
        <SosBanner />

        {/* IRIS Strategic Intelligence */}
        <StrategicIntelFeed engagementId={engagement.id} canRegenerate={canEdit("missionControl")} />

        {/* Health strip */}
        <section className="grid grid-cols-1 md:grid-cols-3 rounded-lg overflow-hidden"
          style={{ border: `0.5px solid ${BORDER}`, background: "#1a2333" }}>

          {/* Section health */}
          <div className="p-5">
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Grid3x3 className="h-3.5 w-3.5" /> Section Health
            </div>
            {heatmap.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">No sections configured yet.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {heatmap.map((h) => {
                    const c = HEAT_COLOR[h.status] ?? HEAT_COLOR.Green;
                    return (
                      <div key={h.id} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                          style={{ background: c, boxShadow: `0 0 0 0.5px color-mix(in oklab, ${c} 60%, transparent)` }} />
                        <span className="text-[10px] text-muted-foreground">{h.section_name}</span>
                      </div>
                    );
                  })}
                </div>
                <Link to="/heatmap" className="mt-3 inline-block text-[11px] text-primary hover:underline">View section detail →</Link>
              </>
            )}
          </div>

          {/* Question Health */}
          <div className="p-5" style={{ borderLeft: `0.5px solid ${BORDER}`, cursor: "pointer" }}
            onClick={() => { window.location.href = "/question-health"; }}>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" /> Question Health
            </div>
            <QuestionHealthSummary engagementId={engagement.id} />
          </div>

          {/* Client Sentiment */}
          <div className="p-5" style={{ borderLeft: `0.5px solid ${BORDER}` }}>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Heart className="h-3.5 w-3.5" /> Client Sentiment
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: sentColor }} />
              <span className="text-base font-semibold capitalize" style={{ color: sentColor }}>
                {clientSentiment ?? "No signal"}
              </span>
            </div>
            <Link to="/pulse" className="mt-3 inline-block text-[11px] text-primary hover:underline">View alignment hub →</Link>
          </div>
        </section>

        {/* Mission Spotlight — culture and mission identity */}
        <MissionSpotlight stateCode={(engagement as any).state} />

        {/* Broadcasts + Latest Signal */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-6">
          <div className="rounded-lg" style={{ border: `0.5px solid ${BORDER}`, background: "#1a2333" }}>
            <button type="button" onClick={() => setShowBroadcasts(v => !v)}
              className="flex w-full items-center justify-between px-4 py-3">
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
                    {broadcasts.map(b => (
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

          <div className="rounded-lg" style={{ border: `0.5px solid ${BORDER}`, background: "#1a2333" }}>
            <button type="button" onClick={() => setShowHuddle(v => !v)}
              className="flex w-full items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                <Users className="h-3.5 w-3.5" /> Latest Team Signal
                {latestHuddle && <span className="text-[11px] normal-case tracking-normal">{latestHuddle.submitter_name} · {relativeTime(latestHuddle.created_at)}</span>}
              </div>
              {showHuddle ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {showHuddle && (
              <div className="px-4 pb-4" style={{ borderTop: `0.5px solid ${BORDER}` }}>
                {!latestHuddle ? (
                  <div className="pt-3 text-[12px] text-muted-foreground">No signals yet. Use Submit Signal above.</div>
                ) : (
                  <div className="pt-3 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5"
                      style={{ color: healthColor(latestHuddle.health), background: `color-mix(in oklab, ${healthColor(latestHuddle.health)} 14%, transparent)`, border: `0.5px solid color-mix(in oklab, ${healthColor(latestHuddle.health)} 45%, transparent)` }}>
                      {latestHuddle.health.toUpperCase()}
                    </span>
                    {latestHuddle.priority && <div className="text-[12px]"><span className="text-muted-foreground">Priority: </span>{latestHuddle.priority}</div>}
                    {latestHuddle.risk && <div className="text-[12px]"><span className="text-muted-foreground">Risk: </span>{latestHuddle.risk}</div>}
                    {latestHuddle.client_concern && <div className="text-[12px]"><span className="text-muted-foreground">Client: </span>{latestHuddle.client_concern}</div>}
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
