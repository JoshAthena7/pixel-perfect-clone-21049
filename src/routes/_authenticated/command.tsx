import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import {
  Megaphone,
  Users,
  Grid3x3,
  Thermometer as ThermometerIcon,
  Heart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { LivePresence } from "@/components/war-room/LivePresence";
import { NeedsAttentionPanel } from "@/components/war-room/NeedsAttentionPanel";
import { relativeTime } from "@/lib/time";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";
import { SnapshotsPanel } from "@/components/war-room/SnapshotsPanel";
import { IntelligenceInsightsPanel } from "@/components/war-room/IntelligenceInsightsPanel";
import { SizingSummaryStrip } from "@/components/sizing/SizingSummaryStrip";

export const Route = createFileRoute("/_authenticated/command")({
  head: () => ({ meta: [{ title: "Command Center — Athena" }] }),
  component: CommandCenterGate,
});

function CommandCenterGate() {
  const { loading, isLeadership } = useEngagement();
  if (loading) return null;
  if (!isLeadership) return <Navigate to="/huddle" replace />;
  return <CommandCenter />;
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

function CommandCenter() {
  const { engagement } = useEngagement();
  const [heatmap, setHeatmap] = useState<Heat[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [latestHuddle, setLatestHuddle] = useState<Huddle | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<Snapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showBroadcasts, setShowBroadcasts] = useState(false);
  const [showHuddle, setShowHuddle] = useState(false);

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
        <span className="text-[13px] font-medium truncate">{engagement.name}</span>
        <div className="flex items-center gap-3">
          <SnapshotsPanel />
          <span className="hidden text-[11px] uppercase tracking-wider text-muted-foreground sm:inline">Online now</span>
          <LivePresence variant="compact" />
        </div>
      </header>

      <div className="px-5 pt-4 space-y-4">
        <ErrorBanner error={loadError} onRetry={() => engagement && loadAll(engagement.id)} label="Couldn't load command center data." />
        {isLoading && heatmap.length === 0 && <LoadingSkeleton label="Loading command center…" />}

        {/* ZONE 1 — Needs Attention + Intelligence Insights */}
        <NeedsAttentionPanel />
        <SizingSummaryStrip engagementId={engagement.id} />
        <IntelligenceInsightsPanel />

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
                <div className="flex flex-wrap gap-1.5">
                  {heatmap.map((h) => {
                    const c = HEAT_COLOR[h.status] ?? HEAT_COLOR.Green;
                    return (
                      <span
                        key={h.id}
                        title={`${h.section_name} · ${h.status}`}
                        className="h-3 w-3 rounded-sm"
                        style={{ background: c, boxShadow: `0 0 0 0.5px color-mix(in oklab, ${c} 60%, transparent)` }}
                      />
                    );
                  })}
                </div>
                <Link to="/heatmap" className="mt-3 inline-block text-[11px] text-primary hover:underline">Open heatmap →</Link>
              </>
            )}
          </div>

          {/* Temperature */}
          <div className="p-5" style={{ borderLeft: `0.5px solid ${BORDER}` }}>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <ThermometerIcon className="h-3.5 w-3.5" /> Temperature
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold leading-none" style={{ color: tier.color }}>{temperature}</span>
              <span className="text-[11px] text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: tier.color }}>
              {tier.label}
            </div>
            {!latestSnapshot && (
              <div className="mt-2 text-[11px] text-muted-foreground">No snapshot yet</div>
            )}
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
                <Users className="h-3.5 w-3.5" /> Latest Huddle
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
