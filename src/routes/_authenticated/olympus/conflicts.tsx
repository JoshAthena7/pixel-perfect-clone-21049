// H1: Olympus → Security → Conflicts. Lists unreviewed cross-mission conflict
// pairs (same state + procurement_id) and lets an Admin acknowledge each with
// a written justification (logged to olympus_audit_log).
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ShieldAlert, Check } from "lucide-react";
import { toast } from "sonner";
import {
  listUnreviewedConflicts,
  acknowledgeConflict,
  type ConflictPair,
} from "@/lib/conflict-detection.functions";

export const Route = createFileRoute("/_authenticated/olympus/conflicts")({
  component: ConflictsPage,
});

function ConflictsPage() {
  const listFn = useServerFn(listUnreviewedConflicts);
  const ackFn = useServerFn(acknowledgeConflict);
  const { data: pairs = [], refetch, isLoading } = useQuery({
    queryKey: ["mission-conflicts"],
    queryFn: () => listFn(),
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Security</div>
        <h1 className="h1-display mt-1">Potential conflicts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Active missions sharing the same state and procurement ID. Acknowledge with a justification — both missions remain open, the decision is logged.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24 w-full" />)}
        </div>
      ) : pairs.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          <ShieldAlert className="mx-auto mb-2 h-6 w-6 opacity-50" />
          No unreviewed conflicts.
        </div>
      ) : (
        <div className="space-y-3">
          {pairs.map((p) => (
            <ConflictRow
              key={`${p.mission_a.id}-${p.mission_b.id}`}
              pair={p}
              onAck={async (justification) => {
                await ackFn({
                  data: {
                    missionAId: p.mission_a.id,
                    missionBId: p.mission_b.id,
                    justification,
                  },
                });
                toast.success("Conflict acknowledged and logged");
                refetch();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConflictRow({
  pair,
  onAck,
}: {
  pair: ConflictPair;
  onAck: (j: string) => Promise<void>;
}) {
  const [justification, setJustification] = useState("");
  const mut = useMutation({
    mutationFn: () => onAck(justification.trim()),
  });
  const canSubmit = justification.trim().length >= 10 && !mut.isPending;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5 text-amber-400" />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-amber-200/80">
            {pair.mission_a.state ?? "—"} · procurement {pair.mission_a.procurement_id ?? "—"}
          </div>
          <div className="mt-1 grid gap-2 md:grid-cols-2">
            <MissionCard m={pair.mission_a} />
            <MissionCard m={pair.mission_b} />
          </div>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Justification (e.g. 'Different program types — confirmed no conflict')"
            className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            rows={2}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => mut.mutate()}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-400 disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              {mut.isPending ? "Logging…" : "Proceed with acknowledgment"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MissionCard({ m }: { m: ConflictPair["mission_a"] }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-sm font-medium">{m.name}</div>
      <div className="text-[11px] text-muted-foreground">{m.client}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {m.status ?? "—"}
      </div>
    </div>
  );
}
