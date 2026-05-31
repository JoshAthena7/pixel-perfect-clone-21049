import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Compass, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Risk = {
  id: string;
  title: string;
  severity: "Low" | "Medium" | "High";
  likelihood: "Low" | "Medium" | "High";
  status: string;
  owner_name: string | null;
  created_at: string;
};

type Signal = {
  id: string;
  topic: string;
  signal_type: "Aligned" | "Drift" | "Misaligned" | "Blocked";
  status: string;
  notes: string | null;
  created_at: string;
};

const SEV_STYLE: Record<string, string> = {
  High: "bg-red-500/15 text-red-400 border-red-500/30",
  Medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const SIG_STYLE: Record<string, string> = {
  Aligned: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Drift: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Misaligned: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  Blocked: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function RisksSignalsPanel() {
  const { engagement, canEdit, isLeadership } = useEngagement();
  const canAddSignal = canEdit("missionControl");
  const [risks, setRisks] = useState<Risk[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (engId: string) => {
    setLoading(true);
    const [r, s] = await Promise.all([
      supabase.from("risks").select("id,title,severity,likelihood,status,owner_name,created_at")
        .eq("engagement_id", engId).in("status", ["Open", "Monitoring"]).order("created_at", { ascending: false }).limit(8),
      supabase.from("alignment_signals").select("id,topic,signal_type,status,notes,created_at")
        .eq("engagement_id", engId).in("status", ["Open", "Acknowledged"]).order("created_at", { ascending: false }).limit(8),
    ]);
    if (!r.error && r.data) setRisks(r.data as Risk[]);
    if (!s.error && s.data) setSignals(s.data as Signal[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (engagement) load(engagement.id);
  }, [engagement?.id, load]);

  if (!engagement) return null;

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <RisksCard
        risks={risks}
        loading={loading}
        canAdd={isLeadership}
        onAdded={() => load(engagement.id)}
        engagementId={engagement.id}
      />
      <SignalsCard
        signals={signals}
        loading={loading}
        canAdd={canAddSignal}
        onAdded={() => load(engagement.id)}
        engagementId={engagement.id}
      />
    </section>
  );
}

function RisksCard({ risks, loading, canAdd, onAdded, engagementId }: {
  risks: Risk[]; loading: boolean; canAdd: boolean; onAdded: () => void; engagementId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<"Low" | "Medium" | "High">("Medium");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("risks").insert({
      engagement_id: engagementId,
      title: title.trim(),
      severity,
      likelihood: "Medium",
      status: "Open",
      created_by: u.user?.id,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setTitle(""); setSeverity("Medium"); setAdding(false);
    toast.success("Risk logged");
    onAdded();
  }

  return (
    <Card className="border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5" /> Open Risks
        </h3>
        {canAdd && !adding && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Log
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded-md border border-border bg-surface-hover/40 p-3">
          <Input placeholder="What's the risk?" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
          <div className="flex items-center gap-2">
            <select value={severity} onChange={(e) => setSeverity(e.target.value as any)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-7" onClick={() => { setAdding(false); setTitle(""); }}>Cancel</Button>
            <Button size="sm" className="h-7" disabled={submitting || !title.trim()} onClick={submit}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : risks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No open risks. {canAdd ? "Log the first one to start tracking." : ""}</p>
      ) : (
        <ul className="space-y-2">
          {risks.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{r.title}</p>
                {r.owner_name && <p className="text-[11px] text-muted-foreground">Owner: {r.owner_name}</p>}
              </div>
              <Badge variant="outline" className={`shrink-0 text-[10px] ${SEV_STYLE[r.severity]}`}>{r.severity}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SignalsCard({ signals, loading, canAdd, onAdded, engagementId }: {
  signals: Signal[]; loading: boolean; canAdd: boolean; onAdded: () => void; engagementId: string;
}) {
  const [adding, setAdding] = useState(false);
  const [topic, setTopic] = useState("");
  const [signalType, setSignalType] = useState<Signal["signal_type"]>("Drift");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!topic.trim()) return;
    setSubmitting(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("alignment_signals").insert({
      engagement_id: engagementId,
      topic: topic.trim(),
      signal_type: signalType,
      status: "Open",
      created_by: u.user?.id,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    setTopic(""); setSignalType("Drift"); setAdding(false);
    toast.success("Signal recorded");
    onAdded();
  }

  return (
    <Card className="border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          <Compass className="h-3.5 w-3.5" /> Alignment Signals
        </h3>
        {canAdd && !adding && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Flag
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded-md border border-border bg-surface-hover/40 p-3">
          <Input placeholder="Topic (e.g. Scope of Phase 2)" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-8 text-sm" />
          <div className="flex items-center gap-2">
            <select value={signalType} onChange={(e) => setSignalType(e.target.value as any)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              <option>Aligned</option><option>Drift</option><option>Misaligned</option><option>Blocked</option>
            </select>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-7" onClick={() => { setAdding(false); setTopic(""); }}>Cancel</Button>
            <Button size="sm" className="h-7" disabled={submitting || !topic.trim()} onClick={submit}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : signals.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active signals. {canAdd ? "Flag drift or blockers as you spot them." : ""}</p>
      ) : (
        <ul className="space-y-2">
          {signals.map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{s.topic}</p>
                {s.notes && <p className="line-clamp-1 text-[11px] text-muted-foreground">{s.notes}</p>}
              </div>
              <Badge variant="outline" className={`shrink-0 text-[10px] ${SIG_STYLE[s.signal_type]}`}>{s.signal_type}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
