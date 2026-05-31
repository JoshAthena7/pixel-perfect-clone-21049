import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";

export const Route = createFileRoute("/_authenticated/command-v2")({
  head: () => ({ meta: [{ title: "Mission v2 — Athena" }] }),
  component: CommandV2Gate,
});

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

function CommandV2Gate() {
  const { loading, isLeadership } = useEngagement();
  if (loading) return null;
  if (!isLeadership) return <Navigate to="/huddle" replace />;
  return <CommandV2 />;
}

function CommandV2() {
  const { engagement } = useEngagement();
  const [heatmap, setHeatmap] = useState<Heat[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [latestHuddle, setLatestHuddle] = useState<Huddle | null>(null);
  const [latestSnapshot, setLatestSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadAll(eid: string) {
    setLoadError(null);
    const [heat, bc, snap, hud] = await Promise.all([
      supabase.from("heatmap_sections").select("*").eq("engagement_id", eid).order("sort_order"),
      supabase.from("broadcasts").select("*").eq("engagement_id", eid).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(5),
      supabase.from("snapshots").select("temperature_score,client_sentiment,created_at").eq("engagement_id", eid).order("snapshot_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("huddles").select("id,health,priority,risk,client_concern,writer_concern,submitter_name,created_at").eq("engagement_id", eid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
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
      .channel(`cmdv2:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", filter: `engagement_id=eq.${engagement.id}` }, () => loadAll(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  if (!engagement) return null;

  return (
    <div className="w-full px-6 py-8 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">Command · v2</div>
          <h1 className="text-2xl font-semibold mt-1">{engagement.name}</h1>
        </div>
        <Link to="/command" className="text-[11px] text-primary hover:underline">← Back to v1</Link>
      </header>

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {loadError}
        </div>
      )}

      {/* Blank canvas — data is loaded and ready. Redesign freely below. */}
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
        <p className="font-medium text-foreground">Blank canvas</p>
        <p className="mt-1 text-xs">
          Data wired: {heatmap.length} sections · {broadcasts.length} broadcasts ·{" "}
          {latestSnapshot ? `temp ${latestSnapshot.temperature_score}` : "no snapshot"} ·{" "}
          {latestHuddle ? `huddle by ${latestHuddle.submitter_name}` : "no huddle"}
        </p>
        <p className="mt-3 text-[11px]">
          Start building your new Command Center here. State: <code>heatmap</code>, <code>broadcasts</code>,{" "}
          <code>latestSnapshot</code>, <code>latestHuddle</code>. Realtime subscription is already live.
        </p>
      </div>
    </div>
  );
}
