import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { calcTemperature } from "@/components/war-room/Thermometer";
import { Siren, Users, ShieldAlert, Megaphone, Grid3x3, Sparkles, Clock, Settings as SettingsIcon, Inbox } from "lucide-react";
import { LivePresence } from "@/components/war-room/LivePresence";
import { ActionLauncher } from "@/components/war-room/ActionLauncher";
import { NeedsAttentionPanel } from "@/components/war-room/NeedsAttentionPanel";
import { Button } from "@/components/ui/button";
import { relativeTime, hoursSince } from "@/lib/time";
import { useNeedsAttention } from "@/hooks/use-needs-attention";

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
type HeatStatus = "Green" | "Yellow" | "Orange" | "Red";
type Heat = { id: string; section_name: string; status: HeatStatus; sort_order: number };
type Broadcast = { id: string; content: string; author_name: string; created_at: string; pinned: boolean };

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

function CommandCenter() {
  const { engagement } = useEngagement();
  const [latestHuddle, setLatestHuddle] = useState<Huddle | null>(null);
  const [recentHuddles, setRecentHuddles] = useState<Huddle[]>([]);
  const [openSos, setOpenSos] = useState<Sos[]>([]);
  const [openRisks, setOpenRisks] = useState<Risk[]>([]);
  const [heatmap, setHeatmap] = useState<Heat[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [latestPulse, setLatestPulse] = useState<{ sentiment: string } | null>(null);
  const { items: attentionItems } = useNeedsAttention(engagement?.id);
  const attentionCount = attentionItems.filter((i) => !i.resolved).length;

  async function loadAll(eid: string) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [h, sos, risks, heat, bc, pulse] = await Promise.all([
      supabase.from("huddles").select("*").eq("engagement_id", eid).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }),
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

  const temperature = calcTemperature({
    sos: openSos,
    risks: openRisks,
    latestPulseSentiment: latestPulse?.sentiment ?? null,
    recentHuddles,
  });
  const tier = tempTier(temperature);

  const isFirstTime = recentHuddles.length === 0 && !latestHuddle;
  const hasSubmissionDate = !!engagement.submission_date;
  const noCheckinToday = !!latestHuddle && hoursSince(latestHuddle.created_at) > 24;

  return (
    <div className="w-full">
      {/* 1. Header bar */}
      <header
        className="flex items-center justify-between gap-4 px-5 py-3"
        style={{ borderBottom: `0.5px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[13px] font-medium truncate">{engagement.name}</span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
            style={{
              borderColor: `color-mix(in oklab, ${tier.color} 55%, transparent)`,
              color: tier.color,
              background: `color-mix(in oklab, ${tier.color} 10%, transparent)`,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tier.color }} />
            {tier.label} · {temperature}/100
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] uppercase tracking-wider text-muted-foreground sm:inline">Online now</span>
          <LivePresence variant="compact" />
        </div>
      </header>

      {/* Contextual alert banners */}
      <div className="px-5 pt-4 space-y-3">
        <NeedsAttentionPanel />
        {openSos.length > 0 && (
          <div className="rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/[0.08] px-4 py-3">
            <div className="flex items-start gap-2.5">
              <Siren className="mt-0.5 h-4 w-4 text-[#ef4444]" />
              <div className="flex-1 text-sm">
                <span className="font-bold text-[#ef4444]">{openSos.length} alert{openSos.length > 1 ? "s" : ""} require attention</span>
                <Link to="/sos" className="ml-3 text-xs text-[#ef4444] underline">View SOS →</Link>
              </div>
            </div>
          </div>
        )}
        {isFirstTime && (
          <div className="rounded-lg border border-primary/40 bg-primary/[0.08] px-4 py-3 flex items-center gap-3 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Welcome — submit your first Daily Huddle to activate engagement health.</span>
            <Button asChild size="sm" className="ml-auto"><Link to="/huddle">Start Huddle</Link></Button>
          </div>
        )}
        {!hasSubmissionDate && !isFirstTime && (
          <div className="rounded-lg border px-4 py-3 flex items-center gap-3 text-sm" style={{ borderColor: BORDER, background: "#1a2333" }}>
            <SettingsIcon className="h-4 w-4 text-muted-foreground" />
            <span>Set your submission date in Settings to activate the countdown.</span>
            <Button asChild size="sm" variant="outline" className="ml-auto"><Link to="/settings">Settings</Link></Button>
          </div>
        )}
        {noCheckinToday && (
          <div className="rounded-lg border border-[#eab308]/40 bg-[#eab308]/[0.08] px-4 py-3 flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-[#eab308]" />
            <span>No check-in today — submit a Daily Huddle to refresh health.</span>
            <Button asChild size="sm" className="ml-auto"><Link to="/huddle">Submit</Link></Button>
          </div>
        )}
      </div>

      {/* 2. Metric row — 0.5px dividers */}
      <div className="mt-4 grid grid-cols-5" style={{ borderTop: `0.5px solid ${BORDER}`, borderBottom: `0.5px solid ${BORDER}` }}>
        <MetricCell icon={<Siren className="h-5 w-5" />} value={openSos.length} label="Open SOS" alert={openSos.length > 0} />
        <MetricCell icon={<ShieldAlert className="h-5 w-5" />} value={openRisks.length} label="Open risks" alert={openRisks.length > 0} divider />
        <MetricCell icon={<Inbox className="h-5 w-5" />} value={attentionCount} label="Needs attention" alert={attentionCount > 0} divider to="/needs-attention" />
        <MetricCell icon={<Grid3x3 className="h-5 w-5" />} value={heatmap.length} label="Heat sections" divider />
        <MetricCell icon={<Users className="h-5 w-5" />} value={recentHuddles.length} label="Recent huddles" divider />
      </div>

      {/* Quick action launcher (leadership) */}
      <div className="px-5 pt-5">
        <ActionLauncher />
      </div>

      {/* 3. Heat map hero */}
      <section className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <Grid3x3 className="h-3.5 w-3.5" /> Heat Map
          </div>
          <Link to="/heatmap" className="text-xs text-primary hover:underline">Open →</Link>
        </div>
        {heatmap.length === 0 ? (
          <div className="rounded-lg p-6 text-center text-sm text-muted-foreground" style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}>
            No heat map sections yet.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {heatmap.map((h) => {
              const color = HEAT_COLOR[h.status] ?? HEAT_COLOR.Green;
              return (
                <Link
                  key={h.id}
                  to="/heatmap"
                  className="group flex items-center justify-between rounded-lg px-4 py-3 transition hover:border-[color:var(--primary)]"
                  style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}
                >
                  <span className="truncate text-sm font-medium">{h.section_name}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      color,
                      background: `color-mix(in oklab, ${color} 14%, transparent)`,
                      border: `0.5px solid color-mix(in oklab, ${color} 45%, transparent)`,
                    }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                    {h.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Bottom — 3-column equal grid */}
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderTop: `0.5px solid ${BORDER}` }}>
        {/* Broadcasts */}
        <section className="p-5" style={{ borderRight: `0.5px solid ${BORDER}` }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Megaphone className="h-3.5 w-3.5" /> Broadcasts
            </div>
            <Link to="/broadcasts" className="text-xs text-primary hover:underline">All →</Link>
          </div>
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => {
              const b = broadcasts[i];
              if (!b) {
                return (
                  <li key={`empty-${i}`} className="rounded-lg px-3 py-2.5 text-[12px] text-muted-foreground" style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}>
                    No recent broadcasts
                  </li>
                );
              }
              return (
                <li key={b.id} className="rounded-lg px-3 py-2.5" style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}>
                  <div className="flex items-start gap-2">
                    <span className="text-base leading-none">{b.pinned ? "📌" : "📣"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-white line-clamp-2">{b.content}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {b.author_name} · {relativeTime(b.created_at)}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Slack feed (compact) */}
        <section className="p-5" style={{ borderRight: `0.5px solid ${BORDER}` }}>
          <CompactSlackPanel />
        </section>

        {/* Recent Huddles */}
        <section className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Recent Huddles
            </div>
            <Link to="/huddle" className="text-xs text-primary hover:underline">New →</Link>
          </div>
          {recentHuddles.length === 0 ? (
            <div className="rounded-lg px-3 py-2.5 text-[12px] text-muted-foreground" style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}>
              No huddles in the last 7 days
            </div>
          ) : (
            <ul className="space-y-2">
              {recentHuddles.slice(0, 3).map((h) => {
                const c = huddleHealthColor(h.health);
                const label = (h.health || "").toUpperCase();
                const note = h.risk ?? h.client_concern ?? h.writer_concern ?? h.priority ?? "—";
                return (
                  <li key={h.id} className="rounded-lg px-3 py-2.5" style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}>
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5"
                        style={{ color: c, background: `color-mix(in oklab, ${c} 14%, transparent)`, border: `0.5px solid color-mix(in oklab, ${c} 45%, transparent)` }}>
                        {label}
                      </span>
                      <span className="text-[12px] text-white truncate flex-1">{note}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground pl-3.5">
                      {h.submitter_name} · {relativeTime(h.created_at)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function huddleHealthColor(health: string): string {
  const h = (health || "").toLowerCase();
  if (h.includes("block") || h === "red") return "#ef4444";
  if (h.includes("risk") || h === "yellow" || h === "orange" || h.includes("warn")) return "#f97316";
  return "#22c55e";
}

const SLACK_CH_KEY = "slackFeed.channelId";
function relSlack(ts: string) {
  const ms = Number(ts) * 1000;
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ms).toLocaleDateString();
}
function slackInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function CompactSlackPanel() {
  const channelsFn = useServerFn(listSlackChannels);
  const messagesFn = useServerFn(getSlackMessages);
  const [channelId, setChannelId] = useState<string>("");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(SLACK_CH_KEY) : null;
    if (saved) setChannelId(saved);
  }, []);

  const channelsQ = useQuery({
    queryKey: ["slack", "channels"],
    queryFn: () => channelsFn(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const joined = (channelsQ.data?.channels ?? []).filter((c) => c.is_member);

  const messagesQ = useQuery({
    queryKey: ["slack", "messages", channelId, 10],
    queryFn: () => messagesFn({ data: { channelId, limit: 10 } }),
    enabled: !!channelId,
    refetchInterval: 30_000,
    retry: false,
  });

  const slackUnavailable = channelsQ.isError;
  const showEmpty = slackUnavailable || !channelId || (!!channelId && messagesQ.data?.needsInvite);
  const messages = messagesQ.data?.messages ?? [];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Hash className="h-3.5 w-3.5" /> Slack Feed
        </div>
        <Select
          value={channelId}
          onValueChange={(v) => { setChannelId(v); localStorage.setItem(SLACK_CH_KEY, v); }}
          disabled={slackUnavailable || joined.length === 0}
        >
          <SelectTrigger className="h-7 w-[160px] text-[11px]">
            <SelectValue placeholder={channelsQ.isLoading ? "Loading…" : "Pick channel"} />
          </SelectTrigger>
          <SelectContent>
            {joined.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />{c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showEmpty ? (
        <div className="rounded-lg px-3 py-2.5 flex items-start gap-2 text-[12px] text-muted-foreground" style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}>
          <Plug className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Invite the Slack bot to a channel, then select it above to start streaming.</span>
        </div>
      ) : (
        <ul className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {messagesQ.isLoading && messages.length === 0 && (
            <li className="text-[12px] text-muted-foreground">Loading…</li>
          )}
          {!messagesQ.isLoading && messages.length === 0 && (
            <li className="text-[12px] text-muted-foreground">No messages yet.</li>
          )}
          {messages.slice(-10).map((m: typeof messages[number]) => (
            <li key={m.ts} className="flex gap-2 rounded-lg px-3 py-2" style={{ background: "#1a2333", border: `0.5px solid ${BORDER}` }}>
              <Avatar className="h-6 w-6 shrink-0">
                {m.userAvatar && <AvatarImage src={m.userAvatar} alt={m.userName} />}
                <AvatarFallback className="text-[9px]">{slackInitials(m.userName)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-semibold text-white truncate">{m.userName}</span>
                  <span className="text-[10px] text-muted-foreground">{relSlack(m.ts)}</span>
                </div>
                <div className="text-[12px] text-white/90 break-words whitespace-pre-wrap line-clamp-3">{m.text}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function MetricCell({
  icon,
  value,
  label,
  alert,
  divider,
  to,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  alert?: boolean;
  divider?: boolean;
  to?: string;
}) {
  const content = (
    <div
      className="flex items-center gap-4 px-5 py-5 w-full text-left"
      style={divider ? { borderLeft: `0.5px solid ${BORDER}` } : undefined}
    >
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <div className="text-3xl font-bold leading-none" style={{ color: alert ? "#ef4444" : "white" }}>{value}</div>
        <div className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
  if (to) return <Link to={to} className="hover:bg-white/[0.02] transition">{content}</Link>;
  return content;
}
