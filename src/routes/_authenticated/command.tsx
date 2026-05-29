import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { HealthCircle } from "@/components/war-room/HealthCircle";
import { StatusPill, type StatusColor } from "@/components/war-room/StatusPill";
import { Thermometer, calcTemperature } from "@/components/war-room/Thermometer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Siren, Users, ShieldAlert, Megaphone, Grid3x3, Camera, Info, Sparkles, Clock, Settings as SettingsIcon } from "lucide-react";
import { LivePresence } from "@/components/war-room/LivePresence";
import { SlackFeed } from "@/components/war-room/SlackFeed";
import { ActionLauncher } from "@/components/war-room/ActionLauncher";
import { toast } from "sonner";
import { relativeTime, hoursSince } from "@/lib/time";

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

type Huddle = { id: string; health: string; priority: string; risk: string | null; client_concern: string | null; writer_concern: string | null; submitter_name: string; created_at: string; needs_leadership: boolean };
type Sos = { id: string; severity: string; category: string; description: string; submitter_name: string; status: string; created_at: string };
type Risk = { id: string; title: string; severity: string; likelihood: string; status: string };
type Heat = { id: string; section_name: string; status: StatusColor; sort_order: number };
type Broadcast = { id: string; content: string; author_name: string; created_at: string; pinned: boolean };

function CommandCenter() {
  const { engagement, member } = useEngagement();
  const [latestHuddle, setLatestHuddle] = useState<Huddle | null>(null);
  const [recentHuddles, setRecentHuddles] = useState<Huddle[]>([]);
  const [openSos, setOpenSos] = useState<Sos[]>([]);
  const [openRisks, setOpenRisks] = useState<Risk[]>([]);
  const [heatmap, setHeatmap] = useState<Heat[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [latestPulse, setLatestPulse] = useState<{ sentiment: string } | null>(null);
  const [todaySnapshotId, setTodaySnapshotId] = useState<string | null>(null);
  const [savingSnap, setSavingSnap] = useState(false);

  async function loadAll(eid: string) {
    const [h, sos, risks, heat, bc, pulse] = await Promise.all([
      supabase.from("huddles").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(5),
      supabase.from("sos_alerts").select("*").eq("engagement_id", eid).neq("status", "Resolved").order("created_at", { ascending: false }),
      supabase.from("risks").select("id,title,severity,likelihood,status").eq("engagement_id", eid).neq("status", "Closed").order("updated_at", { ascending: false }),
      supabase.from("heatmap_sections").select("*").eq("engagement_id", eid).order("sort_order"),
      supabase.from("broadcasts").select("*").eq("engagement_id", eid).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(3),
      supabase.from("client_pulses").select("sentiment").eq("engagement_id", eid).order("interaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setRecentHuddles((h.data as Huddle[]) ?? []);
    setLatestHuddle(((h.data as Huddle[]) ?? [])[0] ?? null);
    setOpenSos((sos.data as Sos[]) ?? []);
    setOpenRisks((risks.data as Risk[]) ?? []);
    setHeatmap((heat.data as Heat[]) ?? []);
    setBroadcasts((bc.data as Broadcast[]) ?? []);
    setLatestPulse((pulse.data as { sentiment: string } | null) ?? null);

    const today = new Date().toISOString().slice(0, 10);
    const { data: snap } = await supabase
      .from("snapshots")
      .select("id")
      .eq("engagement_id", eid)
      .eq("snapshot_date", today)
      .maybeSingle();
    setTodaySnapshotId((snap as { id: string } | null)?.id ?? null);
  }

  async function takeSnapshot() {
    if (!engagement || !member) return;
    setSavingSnap(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const heatmapJson = heatmap.map((h) => ({ section_name: h.section_name, status: h.status }));
      const payload = {
        engagement_id: engagement.id,
        snapshot_date: today,
        health: (latestHuddle?.health ?? "Unknown"),
        temperature_score: temperature,
        open_sos_count: openSos.length,
        open_risk_count: openRisks.length,
        client_sentiment: latestPulse?.sentiment ?? null,
        heatmap_json: heatmapJson,
        top_priority: latestHuddle?.priority ?? null,
        top_risk: latestHuddle?.risk ?? null,
        taken_by_name: member.display_name,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("snapshots")
        .upsert(payload, { onConflict: "engagement_id,snapshot_date" });
      if (error) throw error;
      toast.success(todaySnapshotId ? "Snapshot updated" : "Snapshot saved");
      await loadAll(engagement.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save snapshot";
      toast.error(msg);
    } finally {
      setSavingSnap(false);
    }
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

  const health = (latestHuddle?.health ?? "Unknown") as "Green" | "Yellow" | "Red" | "Unknown";
  const staleHours = latestHuddle ? hoursSince(latestHuddle.created_at) : Infinity;
  const stale = staleHours > 24;

  const temperature = calcTemperature({
    sos: openSos,
    risks: openRisks,
    latestPulseSentiment: latestPulse?.sentiment ?? null,
    recentHuddles,
  });

  const isFirstTime = recentHuddles.length === 0;
  const hasSubmissionDate = !!engagement.submission_date;
  const noCheckinToday = !!latestHuddle && staleHours > 24;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        {/* Topbar */}
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
            <p className="text-xs text-muted-foreground">Live executive view — health, risks, signals, and team activity.</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={takeSnapshot}
                disabled={savingSnap}
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                {savingSnap ? "Saving…" : todaySnapshotId ? "📸 Update Today's Snapshot" : "📸 Snapshot"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Capture today's engagement state to the Snapshot Log</TooltipContent>
          </Tooltip>
        </div>

        {/* First-time welcome banner */}
        {isFirstTime && (
          <div className="rounded-xl border border-primary/40 bg-primary/10 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="text-base font-bold">👋 Welcome to your War Room</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start by submitting a Daily Huddle to activate your engagement health status.
                </p>
                <Button asChild className="mt-4" size="sm">
                  <Link to="/huddle"><Users className="mr-2 h-4 w-4" />Submit Your First Huddle</Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Submission date prompt */}
        {!hasSubmissionDate && !isFirstTime && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-hover/40 px-4 py-3 text-sm">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            <span>⚙️ Set your submission date in Settings to activate the countdown clock</span>
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link to="/settings">Open Settings</Link>
            </Button>
          </div>
        )}

        {/* No-checkin-today yellow nudge */}
        {noCheckinToday && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--yellow)]/40 bg-[color:var(--yellow)]/10 px-4 py-3 text-sm">
            <Clock className="h-4 w-4 text-[color:var(--yellow)]" />
            <span>No check-in today — submit a Daily Huddle to update engagement health</span>
            <Button asChild size="sm" className="ml-auto">
              <Link to="/huddle">Submit Huddle</Link>
            </Button>
          </div>
        )}

        {/* SOS banner */}
        {openSos.length > 0 && (
          <div className="rounded-xl border border-[color:var(--red)]/40 bg-[color:color-mix(in_oklab,var(--red)_14%,transparent)] p-4 glow-red">
            <div className="flex items-start gap-3">
              <Siren className="mt-0.5 h-5 w-5 text-[color:var(--red)]" />
              <div className="flex-1">
                <div className="text-sm font-bold text-[color:var(--red)] uppercase tracking-wide">
                  🚨 {openSos.length} alert{openSos.length > 1 ? "s" : ""} require attention
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {openSos.slice(0, 3).map((s) => (
                    <li key={s.id} className="flex items-baseline gap-2">
                      <StatusPill status={s.severity === "Critical" ? "Red" : s.severity === "High" ? "Orange" : "Yellow"} label={s.severity} />
                      <span className="font-medium">{s.category}</span>
                      <span className="text-muted-foreground">— {s.description}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/sos" className="mt-3 inline-block text-xs font-medium text-[color:var(--red)] underline">View SOS board →</Link>
              </div>
            </div>
          </div>
        )}

        {/* Health banner */}
        <Card className="flex flex-col gap-6 border-border bg-surface p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            <HealthCircle health={health} />
            <div>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                Engagement Health
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="What do these mean?" className="text-muted-foreground hover:text-foreground">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="space-y-1 text-xs">
                      <div><strong className="text-[color:var(--green)]">Green</strong> — on track, no major issues</div>
                      <div><strong className="text-[color:var(--yellow)]">Yellow</strong> — pushing hard, watching closely</div>
                      <div><strong className="text-[color:var(--red)]">Red</strong> — at risk or blocked, needs leadership</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-2xl font-bold">
                {health === "Unknown" ? "No huddle yet" : `${health} — ${latestHuddle?.priority ?? ""}`}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {latestHuddle ? `Updated ${relativeTime(latestHuddle.created_at)} by ${latestHuddle.submitter_name}` : "Submit your first daily huddle"}
                {stale && latestHuddle && <span className="ml-2 text-[color:var(--yellow)]">• stale</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild><Link to="/huddle"><Users className="mr-2 h-4 w-4" />New Huddle</Link></Button>
            <Button asChild variant="destructive"><Link to="/sos"><Siren className="mr-2 h-4 w-4" />Raise SOS</Link></Button>
          </div>
        </Card>

        {/* Engagement Temperature */}
        <Card className="border-border bg-surface p-6">
          <Thermometer score={temperature} />
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
            <div><span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: "#3b82f6" }} />0–30 Stable</div>
            <div><span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: "var(--yellow)" }} />31–55 Warming</div>
            <div><span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: "var(--orange)" }} />56–75 Elevated</div>
            <div><span className="inline-block h-2 w-2 rounded-full mr-1.5 align-middle" style={{ background: "var(--red)" }} />76–100 Critical</div>
          </div>
        </Card>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric icon={<Siren className="h-4 w-4" />} label="Open SOS" value={openSos.length} accent="Red" tip="Count of SOS alerts that are not yet Resolved. Click an alert in the SOS board to acknowledge or resolve." />
          <Metric icon={<ShieldAlert className="h-4 w-4" />} label="Open Risks" value={openRisks.length} accent="Orange" tip="Risks with status Open or Mitigating. Closed risks are excluded." />
          <Metric icon={<Grid3x3 className="h-4 w-4" />} label="Heat sections" value={heatmap.length} accent="Green" tip="Number of tracked engagement sections (LTSS, Care Mgmt, Quality, etc.)." />
          <Metric icon={<Users className="h-4 w-4" />} label="Huddles (recent)" value={recentHuddles.length} accent="Green" tip="Last 5 daily huddles submitted by anyone on the team." />
        </div>

        <LivePresence variant="full" />

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Heatmap mini */}
          <Card className="border-border bg-surface p-5 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Heat Map</div>
              <Link to="/heatmap" className="text-xs text-primary hover:underline">Open →</Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {heatmap.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-md border border-border bg-surface-hover/50 px-3 py-2">
                  <span className="truncate text-sm font-medium">{h.section_name}</span>
                  <StatusPill status={h.status} />
                </div>
              ))}
            </div>
          </Card>

          {/* Broadcasts */}
          <Card className="border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground"><Megaphone className="inline h-3.5 w-3.5 mr-1" />Broadcasts</div>
              <Link to="/broadcasts" className="text-xs text-primary hover:underline">All →</Link>
            </div>
            {broadcasts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No broadcasts yet — leadership messages will appear here.</div>
            ) : (
              <ul className="space-y-3">
                {broadcasts.map((b) => (
                  <li key={b.id} className="rounded-md border border-border bg-surface-hover/40 p-3">
                    <div className="text-sm">{b.content}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{b.author_name} • {relativeTime(b.created_at)}{b.pinned && " • 📌"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Slack live feed */}
        <SlackFeed />


        {/* Recent huddles */}
        <Card className="border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent Huddles</div>
            <Link to="/huddle" className="text-xs text-primary hover:underline">New →</Link>
          </div>
          {recentHuddles.length === 0 ? (
            <div className="text-sm text-muted-foreground">No huddles yet — submit one to start tracking health.</div>
          ) : (
            <ul className="divide-y divide-border">
              {recentHuddles.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-3 py-3">
                  <StatusPill status={h.health as StatusColor} />
                  <span className="text-sm font-medium">{h.priority}</span>
                  <span className="text-sm text-muted-foreground truncate flex-1">
                    {h.risk ?? h.client_concern ?? h.writer_concern ?? "—"}
                  </span>
                  {h.needs_leadership && <StatusPill status="Orange" label="Needs Leadership" />}
                  <span className="text-xs text-muted-foreground">{h.submitter_name} • {relativeTime(h.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </TooltipProvider>
  );
}

function Metric({
  icon,
  label,
  value,
  accent,
  tip,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: StatusColor;
  tip: string;
}) {
  const color = value === 0 ? "Green" : accent;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Card className="cursor-help border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              {icon}
              {label}
              <Info className="h-3 w-3 opacity-60" />
            </div>
            <StatusPill status={color} label={String(value)} />
          </div>
          <div className="mt-2 text-3xl font-black">{value}</div>
        </Card>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}
