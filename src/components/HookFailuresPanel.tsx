import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Failure = {
  id: string;
  hook_name: string;
  source: string;
  status_code: number | null;
  error_message: string | null;
  created_at: string;
  notified_at: string | null;
};

export function HookFailuresPanel() {
  const [rows, setRows] = useState<Failure[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcked, setShowAcked] = useState(false);
  // ids that are optimistically acked but not yet committed (undo window open)
  const pendingRef = useRef<Map<string, { timer: ReturnType<typeof setTimeout>; row: Failure }>>(new Map());
  // ids whose DB commit is currently in flight — guard against duplicate Retry clicks
  const inflightRef = useRef<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    let q = supabase
      .from("hook_failures")
      .select("id, hook_name, source, status_code, error_message, created_at, notified_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!showAcked) q = q.is("acknowledged_at", null);
    const { data } = await q;
    const fetched = (data ?? []) as Failure[];
    // If we're in unacked view, hide rows still in the pending-undo window
    const pendingIds = pendingRef.current;
    setRows(showAcked ? fetched : fetched.filter((r) => !pendingIds.has(r.id)));
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAcked]);

  function restoreRow(row: Failure) {
    setRows((prev) =>
      prev.some((r) => r.id === row.id)
        ? prev
        : [row, ...prev].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
    );
  }

  // Tunable per environment without code changes. Resolution order:
  //   1. localStorage["athena.ack.commitTimeoutMs"] — runtime override (DevTools)
  //   2. import.meta.env.VITE_ACK_COMMIT_TIMEOUT_MS — build-time per-env value
  //   3. 15000ms default
  // Clamped to a safe range so a bad value can't lock the UI forever or fire instantly.
  const COMMIT_TIMEOUT_MS = (() => {
    const fromStorage =
      typeof window !== "undefined" ? window.localStorage?.getItem("athena.ack.commitTimeoutMs") : null;
    const fromEnv = (import.meta.env as Record<string, string | undefined>).VITE_ACK_COMMIT_TIMEOUT_MS;
    const raw = Number.parseInt(fromStorage ?? fromEnv ?? "", 10);
    const v = Number.isFinite(raw) && raw > 0 ? raw : 15_000;
    return Math.max(1_000, Math.min(120_000, v)); // 1s–120s
  })();

  async function commitAck(row: Failure, loadingToastId?: string) {
    inflightRef.current.add(row.id);
    // Hard guard: if the request hangs (proxy stall, lost socket, etc.) release the
    // lock after COMMIT_TIMEOUT_MS so the row never gets stuck in an in-flight state.
    let timedOut = false;
    const safetyTimer = setTimeout(() => {
      timedOut = true;
      if (inflightRef.current.has(row.id)) {
        inflightRef.current.delete(row.id);
        pendingRef.current.delete(row.id);
        restoreRow(row);
        showRetryToast(row, `Request timed out after ${COMMIT_TIMEOUT_MS / 1000}s. No changes saved.`);
      }
    }, COMMIT_TIMEOUT_MS);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const updatePromise = supabase
        .from("hook_failures")
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: user?.id })
        .eq("id", row.id)
        .is("acknowledged_at", null) // don't clobber concurrent acks
        .select("id");

      const { data, error } = await updatePromise;

      // If the safety timer already fired, the user has been notified and the row
      // restored — ignore the late response so we don't double-handle it.
      if (timedOut) return;

      pendingRef.current.delete(row.id);

      if (error) throw error;

      // Silent RLS denial OR row already acked elsewhere → revert UI to truth
      if (!data || data.length === 0) {
        const { data: fresh } = await supabase
          .from("hook_failures")
          .select("acknowledged_at")
          .eq("id", row.id)
          .maybeSingle();
        if (!fresh?.acknowledged_at) {
          // Not acked in DB and our update affected nothing → permission/network mismatch
          restoreRow(row);
          showRetryToast(row, "The change wasn't saved. Restored the failure to the list.");
          return;
        }
        // else: someone else already acked it — leave it removed from UI
      }

      // Success path — clear any retry loading toast
      if (loadingToastId) {
        toast.success(`Acknowledged ${row.hook_name}`, { id: loadingToastId, duration: 3_000 });
      }
    } catch (e) {
      if (timedOut) return; // already handled by safety timer
      pendingRef.current.delete(row.id);
      restoreRow(row);
      showRetryToast(row, e instanceof Error ? e.message : "Unknown error");
    } finally {
      clearTimeout(safetyTimer);
      inflightRef.current.delete(row.id);
    }
  }

  function showRetryToast(row: Failure, description: string) {
    const toastId = `hook-ack-error-${row.id}`;
    toast.error("Couldn't acknowledge", {
      id: toastId,
      description,
      action: {
        label: "Retry",
        onClick: () => {
          // Guard: if a commit is already in flight or queued, ignore the click.
          if (inflightRef.current.has(row.id) || pendingRef.current.has(row.id)) return;
          // Swap the error toast for a loading toast (sonner renders a spinner).
          // Reusing the same id replaces the toast in place so the Retry action
          // is gone and can't be clicked again while the commit is in flight.
          toast.loading("Retrying acknowledgment…", { id: toastId });
          // Optimistic remove again, then commit immediately (no undo window).
          setRows((prev) => prev.filter((r) => r.id !== row.id));
          void commitAck(row, toastId);
        },
      },
    });
  }

  function ack(row: Failure) {
    // No-op if this row already has a queued or in-flight commit.
    if (pendingRef.current.has(row.id) || inflightRef.current.has(row.id)) return;
    // Optimistic remove
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    // Schedule the actual DB write after the undo window
    const timer = setTimeout(() => void commitAck(row), 10_000);
    pendingRef.current.set(row.id, { timer, row });

    toast.success(`Acknowledged ${row.hook_name}`, {
      duration: 10_000,
      action: {
        label: "Undo",
        onClick: () => {
          const entry = pendingRef.current.get(row.id);
          if (entry) clearTimeout(entry.timer);
          pendingRef.current.delete(row.id);
          // Timer cleared before commit fired → no DB write happened → restore UI
          restoreRow(row);
        },
      },
    });
  }

  // Commit any pending acks if the panel unmounts before the timer fires
  useEffect(() => {
    return () => {
      for (const [, entry] of pendingRef.current.entries()) {
        clearTimeout(entry.timer);
        void commitAck(entry.row);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return null;
  if (rows.length === 0 && !showAcked) {
    return (
      <div className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4" /> All scheduled jobs healthy.
        <button onClick={() => setShowAcked(true)} className="ml-auto text-emerald-300/70 hover:text-emerald-200 underline">
          show history
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-md border border-red-500/40 bg-red-500/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-red-400" />
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
          {showAcked ? "Hook failures (history)" : `${rows.length} unacknowledged hook failure${rows.length === 1 ? "" : "s"}`}
        </div>
        <button
          onClick={() => setShowAcked((v) => !v)}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline"
        >
          {showAcked ? "show unacknowledged only" : "show history"}
        </button>
      </div>
      <div className="space-y-1.5">
        {rows.map((f) => (
          <div key={f.id} className="flex items-start gap-2 rounded border border-border bg-background/40 px-2 py-1.5 text-xs">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <code className="font-bold">{f.hook_name}</code>
                <span className="text-muted-foreground">
                  {f.source}{f.status_code ? ` · ${f.status_code}` : ""} · {new Date(f.created_at).toLocaleString()}
                </span>
              </div>
              {f.error_message && (
                <div className="mt-0.5 line-clamp-2 text-muted-foreground">{f.error_message}</div>
              )}
            </div>
            {!f.notified_at ? (
              <span className="text-[10px] uppercase text-amber-400">pending email</span>
            ) : null}
            {!showAcked && (
              <button
                onClick={() => ack(f)}
                className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-surface-hover"
              >
                Ack
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
