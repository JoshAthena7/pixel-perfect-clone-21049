import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusColor } from "@/components/war-room/StatusPill";
import { Camera, GitCompare, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/snapshots")({
  head: () => ({ meta: [{ title: "Snapshots — Athena" }] }),
  component: Gate,
});

function Gate() {
  const { loading, isLeadership } = useEngagement();
  if (loading) return null;
  if (!isLeadership) return <Navigate to="/huddle" replace />;
  return <SnapshotsPage />;
}

type HeatEntry = { section_name: string; status: StatusColor };
type Snapshot = {
  id: string;
  engagement_id: string;
  snapshot_date: string;
  health: string;
  temperature_score: number;
  open_sos_count: number;
  open_risk_count: number;
  client_sentiment: string | null;
  heatmap_json: HeatEntry[];
  top_priority: string | null;
  top_risk: string | null;
  taken_by_name: string;
  created_at: string;
};

const sentimentEmoji = (s: string | null) => {
  if (!s) return "—";
  const v = s.toLowerCase();
  if (v.includes("posit") || v.includes("happy")) return "😊";
  if (v.includes("concern") || v.includes("upset")) return "😟";
  if (v.includes("neutral")) return "😐";
  return "🙂";
};

const healthToPill = (h: string): StatusColor => {
  if (h === "Red") return "Red";
  if (h === "Yellow") return "Yellow";
  if (h === "Green") return "Green";
  return "Yellow";
};

function SnapshotsPage() {
  const { engagement } = useEngagement();
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  async function load(eid: string) {
    const { data } = await supabase
      .from("snapshots")
      .select("*")
      .eq("engagement_id", eid)
      .order("snapshot_date", { ascending: false });
    setSnaps((data as unknown as Snapshot[]) ?? []);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`snaps:${engagement.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "snapshots", filter: `engagement_id=eq.${engagement.id}` },
        () => load(engagement.id),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [engagement?.id]);

  function toggleSelect(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 2) return [cur[1], id];
      return [...cur, id];
    });
  }

  const [a, b] = useMemo(() => {
    const found = selected.map((id) => snaps.find((s) => s.id === id)).filter(Boolean) as Snapshot[];
    const sorted = [...found].sort((x, y) => x.snapshot_date.localeCompare(y.snapshot_date));
    return [sorted[0], sorted[1]];
  }, [selected, snaps]);

  if (!engagement) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Snapshot Log</h1>
          <p className="text-sm text-muted-foreground">Daily captures of engagement state. {snaps.length} total.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={compareMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setCompareMode((v) => !v);
              setSelected([]);
            }}
          >
            <GitCompare className="mr-2 h-4 w-4" />
            {compareMode ? "Exit compare" : "Compare"}
          </Button>
        </div>
      </div>

      {compareMode && (
        <Card className="border-border bg-surface p-4 text-sm">
          {selected.length === 0 && <span className="text-muted-foreground">Select two snapshots to compare.</span>}
          {selected.length === 1 && <span className="text-muted-foreground">Select one more snapshot.</span>}
          {selected.length === 2 && a && b && <CompareView a={a} b={b} />}
        </Card>
      )}

      {snaps.length === 0 ? (
        <Card className="border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          No snapshots yet. Use the <Camera className="inline h-4 w-4" /> Snapshot button on the Command Center to capture one.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snaps.map((s) => {
            const isSel = selected.includes(s.id);
            return (
              <Card
                key={s.id}
                className={`border-border bg-surface p-5 transition ${
                  compareMode ? "cursor-pointer hover:border-primary" : ""
                } ${isSel ? "ring-2 ring-primary" : ""}`}
                onClick={() => compareMode && toggleSelect(s.id)}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-lg font-bold">
                      {new Date(s.snapshot_date).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <div className="text-[11px] text-muted-foreground">by {s.taken_by_name}</div>
                  </div>
                  <StatusPill status={healthToPill(s.health)} label={s.health} />
                </div>

                <div className="mb-3 grid grid-cols-4 gap-2 text-center">
                  <Stat label="Temp" value={s.temperature_score} />
                  <Stat label="SOS" value={s.open_sos_count} />
                  <Stat label="Risks" value={s.open_risk_count} />
                  <Stat label="Pulse" value={sentimentEmoji(s.client_sentiment)} />
                </div>

                <MiniHeatmap heat={s.heatmap_json ?? []} />

                <div className="mt-3 space-y-1.5 text-xs">
                  <div>
                    <span className="font-semibold text-muted-foreground">Top priority: </span>
                    <span>{s.top_priority || "—"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-muted-foreground">Top risk: </span>
                    <span>{s.top_risk || "—"}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-border bg-surface-hover/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function MiniHeatmap({ heat }: { heat: HeatEntry[] }) {
  const dot: Record<StatusColor, string> = {
    Green: "bg-[color:var(--green)]",
    Yellow: "bg-[color:var(--yellow)]",
    Orange: "bg-[color:var(--orange)]",
    Red: "bg-[color:var(--red)]",
  };
  return (
    <div className="grid grid-cols-3 gap-1">
      {heat.map((h) => (
        <div
          key={h.section_name}
          className="flex items-center gap-1.5 rounded border border-border bg-surface-hover/30 px-1.5 py-1"
          title={`${h.section_name}: ${h.status}`}
        >
          <span className={`h-2 w-2 rounded-full ${dot[h.status] ?? "bg-muted"}`} />
          <span className="truncate text-[10px]">{h.section_name}</span>
        </div>
      ))}
    </div>
  );
}

function CompareView({ a, b }: { a: Snapshot; b: Snapshot }) {
  const delta = (x: number, y: number) => {
    const d = y - x;
    if (d === 0) return <span className="text-muted-foreground">±0</span>;
    const up = d > 0;
    return (
      <span className={up ? "text-[color:var(--red)]" : "text-[color:var(--green)]"}>
        {up ? "▲" : "▼"} {Math.abs(d)}
      </span>
    );
  };

  const heatMap = (h: HeatEntry[]) => Object.fromEntries(h.map((x) => [x.section_name, x.status]));
  const ha = heatMap(a.heatmap_json ?? []);
  const hb = heatMap(b.heatmap_json ?? []);
  const sections = Array.from(new Set([...Object.keys(ha), ...Object.keys(hb)]));
  const changes = sections.filter((s) => ha[s] !== hb[s]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <Col title={a.snapshot_date} s={a} />
        <Col title={b.snapshot_date} s={b} />
      </div>
      <div className="rounded-md border border-border bg-surface-hover/40 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Deltas</div>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>Temperature: {delta(a.temperature_score, b.temperature_score)}</div>
          <div>Open SOS: {delta(a.open_sos_count, b.open_sos_count)}</div>
          <div>Open risks: {delta(a.open_risk_count, b.open_risk_count)}</div>
          <div>
            Health: <span className="font-medium">{a.health} → {b.health}</span>
          </div>
          <div>
            Pulse: <span className="font-medium">{sentimentEmoji(a.client_sentiment)} → {sentimentEmoji(b.client_sentiment)}</span>
          </div>
        </div>
        {changes.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Heatmap changes</div>
            <ul className="space-y-0.5 text-xs">
              {changes.map((s) => (
                <li key={s}>
                  <span className="font-medium">{s}:</span> {ha[s] ?? "—"} → {hb[s] ?? "—"}
                </li>
              ))}
            </ul>
          </div>
        )}
        {changes.length === 0 && <div className="mt-2 text-xs text-muted-foreground">No heatmap changes.</div>}
      </div>
    </div>
  );
}

function Col({ title, s }: { title: string; s: Snapshot }) {
  return (
    <div className="rounded-md border border-border bg-surface-hover/30 p-3">
      <div className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-0.5 text-xs">
        <div>Health: <StatusPill status={healthToPill(s.health)} label={s.health} /></div>
        <div>Temp: {s.temperature_score}</div>
        <div>SOS: {s.open_sos_count} • Risks: {s.open_risk_count}</div>
        <div>Pulse: {sentimentEmoji(s.client_sentiment)} {s.client_sentiment ?? ""}</div>
        <div className="pt-1"><span className="text-muted-foreground">Priority:</span> {s.top_priority || "—"}</div>
        <div><span className="text-muted-foreground">Risk:</span> {s.top_risk || "—"}</div>
      </div>
    </div>
  );
}
