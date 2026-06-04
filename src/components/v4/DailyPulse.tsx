import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Heart, AlertCircle } from "lucide-react";
import { getMyPulseContext, submitPulse } from "@/lib/pulses.functions";
import { toast } from "sonner";

const PROGRESS_LABELS = ["Just started", "In progress", "Almost done", "Ready for review"];
const CONFIDENCE_LABELS = ["Could use a hand", "Some open questions", "Steady", "Tracking well", "Strong"];

export function DailyPulse() {
  const ctxFn = useServerFn(getMyPulseContext);
  const submit = useServerFn(submitPulse);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pulse-context"],
    queryFn: () => ctxFn(),
    staleTime: 60_000,
  });

  const pending = useMemo(
    () => (data?.assignments ?? []).filter((a) => !a.submittedToday),
    [data],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = pending.find((p) => p.questionId === selectedId) ?? pending[0] ?? null;

  const [progress, setProgress] = useState(2);
  const [confidence, setConfidence] = useState(3);
  const [blocked, setBlocked] = useState(false);
  const [blockedReason, setBlockedReason] = useState("");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await submit({
        data: {
          missionId: selected.missionId,
          questionId: selected.questionId,
          progress,
          confidence,
          blocked,
          blockedReason: blocked ? blockedReason || null : null,
          note: note || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Pulse logged. Thanks for the read.");
      setNote("");
      setBlockedReason("");
      setBlocked(false);
      qc.invalidateQueries({ queryKey: ["pulse-context"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't submit pulse"),
  });

  if (isLoading) return null;
  if (!data || data.assignments.length === 0) return null;

  if (pending.length === 0) {
    return (
      <section className="rounded-[12px] border border-emerald-500/30 bg-emerald-500/5 px-6 py-5">
        <div className="flex items-center gap-3">
          <Check className="h-5 w-5 text-emerald-400" />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
              Daily Pulse
            </div>
            <p className="mt-1 text-sm text-foreground/80">
              You've checked in on every assignment today. Nicely done.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[12px] border border-border bg-surface px-6 py-5" aria-label="Daily pulse">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Heart className="h-3 w-3 text-rose-400" /> Daily Pulse · 60 seconds
          </div>
          <p className="mt-1 text-sm text-foreground/80">
            How's it going? A quick read so IRIS can clear blockers — not score you.
          </p>
        </div>
        {pending.length > 1 && (
          <select
            value={selected?.questionId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            {pending.map((p) => (
              <option key={p.questionId} value={p.questionId}>
                {p.questionNumber ? `${p.questionNumber} · ` : ""}{p.missionName}
              </option>
            ))}
          </select>
        )}
      </div>

      {selected && (
        <div className="mb-4 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-mono text-foreground/80">{selected.questionNumber ?? "Q"}</span>
          {" — "}
          <span className="text-foreground/80">{selected.title}</span>
        </div>
      )}

      <div className="space-y-5">
        <Field label="How's your draft coming along?">
          <input
            type="range"
            min={1}
            max={4}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            className="w-full accent-sky-400"
          />
          <div className="mt-1 text-xs font-medium text-foreground/80">{PROGRESS_LABELS[progress - 1]}</div>
        </Field>

        <Field label="Blocked on anything?">
          <div className="flex gap-2">
            <Pill active={!blocked} onClick={() => setBlocked(false)}>No</Pill>
            <Pill active={blocked} onClick={() => setBlocked(true)} tone="amber">Yes</Pill>
          </div>
          {blocked && (
            <textarea
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              placeholder="What's blocking you? (optional)"
              rows={2}
              className="mt-2 w-full rounded-md border border-amber-500/40 bg-background px-3 py-2 text-sm"
            />
          )}
        </Field>

        <Field label="How are you feeling about your next gate?">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setConfidence(n)}
                className={`flex-1 rounded-md border px-2 py-2 text-xs font-medium transition ${
                  confidence === n
                    ? "border-sky-400 bg-sky-400/10 text-sky-300"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{CONFIDENCE_LABELS[confidence - 1]}</div>
        </Field>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Add a note (optional)</summary>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Anything a teammate should know?"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </details>

        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="text-xs text-muted-foreground">
            {pending.length} {pending.length === 1 ? "check-in" : "check-ins"} pending today.
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !selected}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-[13px] font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? "Sending…" : "Send pulse"}
          </button>
        </div>

        {blocked && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>IRIS will flag this to your lead so a teammate can help unblock you.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children, tone = "sky" }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "sky" | "amber" }) {
  const activeCls = tone === "amber"
    ? "border-amber-400 bg-amber-400/10 text-amber-300"
    : "border-sky-400 bg-sky-400/10 text-sky-300";
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${
        active ? activeCls : "border-border text-muted-foreground hover:border-foreground/30"
      }`}
    >
      {children}
    </button>
  );
}
