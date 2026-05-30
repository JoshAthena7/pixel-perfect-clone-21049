import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusPill, type StatusColor } from "@/components/war-room/StatusPill";
import { Camera, GitCompare } from "lucide-react";

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

export function SnapshotsPanel({ triggerVariant = "outline" }: { triggerVariant?: "outline" | "ghost" | "default" }) {
  const { engagement } = useEngagement();
  const [open, setOpen] = useState(false);
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
    if (!engagement || !open) return;
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
  }, [engagement?.id, open]);

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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={triggerVariant} size="sm">
          <Camera className="mr-2 h-4 w-4" />
          Snapshots
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3">
            <span>Snapshot Log</span>
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
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{snaps.length} total · daily captures of engagement state.</p>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {compareMode && (
            <Card className="border-border bg-surface p-3 text-sm">
              {selected.length === 0 && <span className="text-muted-foreground">Select two snapshots to compare.</span>}
              {selected.length === 1 && <span className="text-muted-foreground">Select one more snapshot.</span>}
              {selected.length === 2 && a && b && <CompareView a={a} b={b} />}
            </Card>
          )}

          {snaps.length === 0 ? (
            <Card className="border-border bg-surface p-6 text-center text-sm text-muted-foreground">
              No snapshots yet.
            </Card>
          ) : (
            <div className="grid gap-3">
              {snaps.map((s) => {
                const isSel = selected.includes(s.id);
                return (
                  <Card
                    key={s.id}
                    className={`border-border bg-surface p-4 transition ${
                      compareMode ? "cursor-pointer hover:border-primary" : ""
                    } ${isSel ? "ring-2 ring-primary" : ""}`}
                    onClick={() => compareMode && toggleSelect(s.id)}
                  >
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold">
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

                    <div className="mt-3 space-y-1 text-xs">
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
      </SheetContent>
    </Sheet>
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
    "N/A": "bg-muted-foreground",
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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Col title={a.snapshot_date} s={a} />
        <Col title={b.snapshot_date} s={b} />
      </div>
      <div className="rounded-md border border-border bg-surface-hover/40 p-3">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Deltas</div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>Temperature: {delta(a.temperature_score, b.temperature_score)}</div>
          <div>Open SOS: {delta(a.open_sos_count, b.open_sos_count)}</div>
          <div>Open risks: {delta(a.open_risk_count, b.open_risk_count)}</div>
          <div>
            Health: <span className="font-medium">{a.health} → {b.health}</span>
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
