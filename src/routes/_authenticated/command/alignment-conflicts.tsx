import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, ChevronDown, ChevronRight, X, CheckCircle2, GitMerge, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/command/alignment-conflicts")({
  component: AlignmentConflictsPage,
});

type Conflict = {
  id: string;
  mission_id: string;
  conflict_type: string;
  description: string;
  severity: string | null;
  question_a_id: string;
  question_b_id: string;
  iris_recommendation: string | null;
  detected_at: string | null;
  resolved_at: string | null;
};

type QRef = {
  id: string;
  question_number: string;
  title: string;
  question_text: string;
  mission_id: string;
};

type GateStatus = {
  id: string;
  question_id: string;
  gate_id: string;
  status: string | null;
  completed_at: string | null;
  entered_at: string | null;
  reviewer_notes: string | null;
};

type Gate = { id: string; gate_name: string; gate_order: number; mission_id: string };

const sevColor: Record<string, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/40",
  warning: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
  info: "bg-blue-500/15 text-blue-300 border-blue-500/40",
};

function relTime(ts: string | null): string {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function AlignmentConflictsPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resolving, setResolving] = useState<Conflict | null>(null);

  const { data: conflicts = [], isLoading } = useQuery({
    queryKey: ["align-conflicts-open"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select("*")
        .is("resolved_at", null)
        .order("detected_at", { ascending: false });
      return (data ?? []) as Conflict[];
    },
  });

  const refIds = Array.from(new Set(conflicts.flatMap((c) => [c.question_a_id, c.question_b_id])));
  const { data: qrefs = [] } = useQuery({
    queryKey: ["align-qrefs-full", refIds.sort().join(",")],
    enabled: refIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,question_text,mission_id")
        .in("id", refIds);
      return (data ?? []) as QRef[];
    },
  });
  const qMap = new Map(qrefs.map((q) => [q.id, q]));

  // Review gate sweep
  const { data: gates = [] } = useQuery({
    queryKey: ["align-gates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("id,gate_name,gate_order,mission_id")
        .order("gate_order");
      return (data ?? []) as Gate[];
    },
  });

  const { data: gateStatuses = [] } = useQuery({
    queryKey: ["align-gate-statuses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_gate_status")
        .select("id,question_id,gate_id,status,completed_at,entered_at,reviewer_notes");
      return (data ?? []) as GateStatus[];
    },
  });

  const sweep = useMemo(() => {
    return gates.map((g) => {
      const rows = gateStatuses.filter((s) => s.gate_id === g.id);
      const passed = rows.filter((r) => r.status === "passed" || r.status === "complete").length;
      const failed = rows.filter((r) => r.status === "failed" || r.status === "blocked").length;
      const inReview = rows.filter((r) => r.status === "in_review" || r.status === "pending").length;
      return { gate: g, total: rows.length, passed, failed, inReview };
    });
  }, [gates, gateStatuses]);

  function toggle(id: string) {
    setExpanded((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <GitMerge className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Alignment Conflicts</h1>
          <p className="text-sm text-muted-foreground">
            Open cross-question conflicts requiring resolution.
          </p>
        </div>
      </div>

      {/* Conflicts table */}
      <div className="mb-10 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-3"></th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Question A</th>
              <th className="px-3 py-3">Question B</th>
              <th className="px-3 py-3">Severity</th>
              <th className="px-3 py-3">Detected</th>
              <th className="px-3 py-3">IRIS Recommendation</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}
            {!isLoading && conflicts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
                  No open alignment conflicts.
                </td>
              </tr>
            )}
            {conflicts.map((c) => {
              const a = qMap.get(c.question_a_id);
              const b = qMap.get(c.question_b_id);
              const sev = (c.severity ?? "warning").toLowerCase();
              const isOpen = expanded.has(c.id);
              return (
                <Fragment key={c.id}>
                  <tr
                    className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => toggle(c.id)}
                  >
                    <td className="px-2 py-3">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.conflict_type}</span>
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {a ? (
                        <>
                          <span className="font-mono text-xs text-muted-foreground mr-1">{a.question_number}</span>
                          {a.title}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {b ? (
                        <>
                          <span className="font-mono text-xs text-muted-foreground mr-1">{b.question_number}</span>
                          {b.title}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded border px-2 py-0.5 text-[11px] uppercase ${sevColor[sev] ?? sevColor.warning}`}>
                        {sev}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{relTime(c.detected_at)}</td>
                    <td className="px-3 py-3 max-w-xs text-xs text-muted-foreground line-clamp-2">
                      {c.iris_recommendation ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setResolving(c);
                        }}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
                      >
                        Resolve
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${c.id}-x`} className="border-t border-border bg-muted/20">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="mb-3 text-sm text-foreground">{c.description}</div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <ExpandedQuestion ref={a} />
                          <ExpandedQuestion ref={b} />
                        </div>
                        {c.iris_recommendation && (
                          <div className="mt-3 rounded border-l-2 border-primary/60 bg-primary/5 px-3 py-2 text-xs text-foreground">
                            <span className="font-semibold text-primary">IRIS:</span> {c.iris_recommendation}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Review Gate Sweep */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Review Gate Sweep
        </h2>
        {sweep.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No review gates configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sweep.map(({ gate, total, passed, failed, inReview }) => {
              const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
              return (
                <div key={gate.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">{gate.gate_name}</div>
                    <span className="text-xs text-muted-foreground">{passed}/{total} passed</span>
                  </div>
                  <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-emerald-400">{passed} passed</span>
                    <span className="text-yellow-400">{inReview} in review</span>
                    <span className="text-red-400">{failed} failed</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {resolving && (
        <ResolveModal
          conflict={resolving}
          onClose={() => setResolving(null)}
          onResolved={() => {
            qc.invalidateQueries({ queryKey: ["align-conflicts-open"] });
            setResolving(null);
          }}
        />
      )}
    </div>
  );
}

function ExpandedQuestion({ ref }: { ref: QRef | undefined }) {
  if (!ref) return null;
  return (
    <div className="rounded border border-border bg-background p-3">
      <div className="mb-1 text-xs font-mono text-muted-foreground">{ref.question_number}</div>
      <div className="mb-2 text-sm font-medium text-foreground">{ref.title}</div>
      <p className="text-xs text-muted-foreground line-clamp-6 whitespace-pre-wrap">{ref.question_text}</p>
    </div>
  );
}

function ResolveModal({
  conflict,
  onClose,
  onResolved,
}: {
  conflict: Conflict;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (notes.trim().length < 5) {
      setError("Resolution notes are required (min 5 characters).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error: e } = await supabase
        .from("alignment_conflicts")
        .update({
          resolution_notes: notes.trim().slice(0, 2000),
          resolved_at: new Date().toISOString(),
          resolved_by: u.user?.id ?? null,
        })
        .eq("id", conflict.id);
      if (e) throw e;
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <h2 className="text-lg font-semibold">Resolve Conflict</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">{conflict.description}</p>
        <label className="block">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Resolution Notes (required)</div>
          <textarea
            value={notes}
            maxLength={2000}
            rows={5}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            placeholder="How was this conflict resolved? Which answer is authoritative going forward?"
          />
        </label>
        {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Resolving…" : "Mark Resolved"}
          </button>
        </div>
      </div>
    </div>
  );
}
