import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  submitMissionPulse,
  getMissionPulseHistory,
  type MissionPulseRow,
} from "@/lib/mission-pulse.functions";
import { toast } from "sonner";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Phone,
  Activity,
  Send,
} from "lucide-react";

type Props = { missionId: string };

type Q = {
  id: string;
  question_number: string;
  title: string;
  status: string | null;
  health: "red" | "yellow" | "green" | null;
  point_value: number | null;
  pens_down_date: string | null;
};

const CONFIDENCE_STEPS = [
  { value: "low" as const, label: "Low", tone: "text-red-300 border-red-500/40 bg-red-500/10" },
  { value: "medium" as const, label: "Medium", tone: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
  { value: "high" as const, label: "High", tone: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
];

export function MissionPulse({ missionId }: Props) {
  const qc = useQueryClient();
  const yesterday = useMemo(() => new Date(Date.now() - 24 * 3_600_000).toISOString(), []);

  // ── Briefing data ────────────────────────────────────────────────
  const { data: questions = [] } = useQuery<Q[]>({
    queryKey: ["mp-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,status,health,point_value,pens_down_date")
        .eq("mission_id", missionId);
      return (data ?? []) as Q[];
    },
  });

  const { data: signalChanges = 0 } = useQuery({
    queryKey: ["mp-signal-changes", missionId, yesterday],
    queryFn: async () => {
      const { count } = await supabase
        .from("signals")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", missionId)
        .gte("created_at", yesterday);
      return count ?? 0;
    },
  });

  const { data: expertConsults = [] } = useQuery({
    queryKey: ["mp-consults", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("expert_consults")
        .select("id,status,created_at,response_at")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const responsesReceived = expertConsults.filter(
    (c) => c.status === "responded" && c.response_at && c.response_at > yesterday,
  ).length;
  const overdueConsults = expertConsults.filter((c) => {
    if (c.status === "responded" || c.status === "closed") return false;
    const age = Date.now() - new Date(c.created_at).getTime();
    return age > 48 * 3_600_000;
  }).length;

  // Health score (0–100)
  const health = useMemo(() => {
    const total = questions.length || 1;
    const approved = questions.filter((q) => q.status === "approved").length;
    const red = questions.filter((q) => q.health === "red").length;
    const score = Math.round(((approved + (total - red) * 0.5) / (total * 1.5)) * 100);
    const clamped = Math.max(0, Math.min(100, score));
    const tone =
      clamped >= 75 ? { dot: "bg-emerald-400", text: "text-emerald-300", label: "Healthy" }
      : clamped >= 50 ? { dot: "bg-amber-400", text: "text-amber-300", label: "Watch" }
      : { dot: "bg-red-400", text: "text-red-300", label: "At risk" };
    return { score: clamped, ...tone };
  }, [questions]);

  // Top-3 critical actions: rank by (point_value) × (1 / max(daysLeft, 1)) when open
  const criticalActions = useMemo(() => {
    const now = Date.now();
    const open = questions
      .filter((q) => q.status !== "approved")
      .map((q) => {
        const days = q.pens_down_date
          ? Math.max(1, Math.ceil((new Date(q.pens_down_date).getTime() - now) / 86_400_000))
          : 30;
        const score = (q.point_value ?? 1) * (1 / days);
        return { ...q, days, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    return open;
  }, [questions]);

  // One-sentence risk
  const topRisk = useMemo(() => {
    const reds = questions.filter((q) => q.health === "red");
    if (overdueConsults > 0)
      return `${overdueConsults} expert consult${overdueConsults === 1 ? " is" : "s are"} past 48h with no reply — chase or reassign.`;
    if (reds.length > 0) {
      const top = reds.sort((a, b) => (b.point_value ?? 0) - (a.point_value ?? 0))[0];
      return `Q${top.question_number} is red and worth ${top.point_value ?? "?"} pts — biggest exposure right now.`;
    }
    if (criticalActions[0]?.days <= 3)
      return `Q${criticalActions[0].question_number} is due in ${criticalActions[0].days}d and still open — clear it first.`;
    return "No red flags. Keep momentum on the top-3 actions below.";
  }, [questions, overdueConsults, criticalActions]);

  // ── Confidence-over-time mini-sparkline ──────────────────────────
  const historyFn = useServerFn(getMissionPulseHistory);
  const { data: history = [] } = useQuery({
    queryKey: ["mp-history", missionId],
    queryFn: () => historyFn({ data: { missionId, limit: 14 } }),
  });

  // ── Submit form ──────────────────────────────────────────────────
  const [changed, setChanged] = useState("");
  const [blocked, setBlocked] = useState("");
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium");

  const submitFn = useServerFn(submitMissionPulse);
  const submit = useMutation({
    mutationFn: () =>
      submitFn({ data: { missionId, changed, blocked, confidence } }),
    onSuccess: () => {
      toast.success("Pulse logged. IRIS is reading it now.");
      setChanged("");
      setBlocked("");
      qc.invalidateQueries({ queryKey: ["mp-history", missionId] });
      qc.invalidateQueries({ queryKey: ["iris-alert", missionId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't submit pulse."),
  });

  return (
    <div className="space-y-5">
      {/* ─── IRIS → You (Briefing) ─── */}
      <section className="rounded-[14px] border border-primary/30 bg-primary/[0.04] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/90">
            <Sparkles className="h-3 w-3" /> IRIS → You · Today's Briefing
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${health.dot}`} />
            <span className={`text-[11px] font-semibold ${health.text}`}>
              Pursuit Health · {health.score} · {health.label}
            </span>
          </div>
        </div>

        {/* Top 3 critical actions */}
        <div className="mt-3">
          <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Today's 3 most critical actions
          </div>
          {criticalActions.length === 0 ? (
            <p className="mt-2 rounded-md border border-border bg-background/40 px-3 py-2 text-[12px] text-muted-foreground">
              All assigned questions are approved — clean board.
            </p>
          ) : (
            <ol className="mt-2 space-y-1.5">
              {criticalActions.map((q, i) => (
                <li
                  key={q.id}
                  className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 text-[12px]"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="font-mono text-foreground/80">Q{q.question_number}</span>
                  <span className="flex-1 truncate text-foreground/85">{q.title}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {q.point_value ?? "?"} pts · {q.days}d
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Signal & expert summary */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <StatTile
            icon={<Activity className="h-3 w-3" />}
            label="PRISIM™ signals (24h)"
            value={String(signalChanges)}
          />
          <StatTile
            icon={<Phone className="h-3 w-3" />}
            label="Expert responses (24h)"
            value={String(responsesReceived)}
            tone={responsesReceived > 0 ? "text-emerald-300" : ""}
          />
          <StatTile
            icon={<AlertTriangle className="h-3 w-3" />}
            label="Overdue consults"
            value={String(overdueConsults)}
            tone={overdueConsults > 0 ? "text-amber-300" : ""}
          />
        </div>

        {/* One-sentence risk */}
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-100">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span>{topRisk}</span>
        </div>

        {/* Confidence sparkline */}
        {history.length > 1 && (
          <div className="mt-3 rounded-md border border-border bg-background/30 px-3 py-2">
            <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Pursuit confidence · last {history.length}
              </span>
              <span className="text-muted-foreground/70 normal-case tracking-normal">
                latest: {history[0]?.confidence ?? "—"}
              </span>
            </div>
            <ConfidenceSparkline points={history.slice().reverse()} />
          </div>
        )}
      </section>

      {/* ─── You → IRIS (Signals back) ─── */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Send className="h-3 w-3" /> You → IRIS · Signals back
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">
          IRIS only sees what's in the system. Tell it what it can't see.
        </p>

        <div className="mt-3 space-y-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              What changed that IRIS doesn't know yet?
            </label>
            <textarea
              value={changed}
              onChange={(e) => setChanged(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Stakeholder call, scope hint, competitor news…"
              className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              What is blocking you right now?
            </label>
            <textarea
              value={blocked}
              onChange={(e) => setBlocked(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Missing data, decision pending, expert silent…"
              className="mt-1 w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground"
            />
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Your confidence in this pursuit today
            </label>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {CONFIDENCE_STEPS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setConfidence(c.value)}
                  className={`rounded-md border px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] transition ${
                    confidence === c.value
                      ? c.tone
                      : "border-border bg-background/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-muted-foreground">
              Logged to the mission Vault · Tier-2 record.
            </span>
            <button
              type="button"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || (!changed.trim() && !blocked.trim())}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {submit.isPending ? "Sending…" : "Send to IRIS"}
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatTile({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-2.5 py-1.5">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-0.5 text-[14px] font-semibold tabular-nums ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function ConfidenceSparkline({ points }: { points: Array<{ confidence: "low" | "medium" | "high" | null }> }) {
  const map = { low: 1, medium: 2, high: 3 } as const;
  const vals = points.map((p) => (p.confidence ? map[p.confidence] : 0)).filter((v) => v > 0);
  if (vals.length === 0) return null;
  const max = 3;
  const w = 240;
  const h = 32;
  const step = vals.length > 1 ? w / (vals.length - 1) : 0;
  const d = vals
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-8 w-full">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-primary" />
      {vals.map((v, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (v / max) * h}
          r={2}
          className={v === 3 ? "fill-emerald-400" : v === 2 ? "fill-amber-400" : "fill-red-400"}
        />
      ))}
    </svg>
  );
}

// Re-export type for callers
export type { MissionPulseRow };
