import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, Loader2, Inbox } from "lucide-react";
import { listReviewQueue, setSourceStatus } from "@/lib/atlas-onboarding.functions";

export const Route = createFileRoute("/_authenticated/olympus/review-queue")({
  component: OlympusReviewQueue,
});

function OlympusReviewQueue() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReviewQueue);
  const setFn = useServerFn(setSourceStatus);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["olympus-review-queue"],
    queryFn: () => listFn({ data: {} as any }),
  });
  const sources = data?.sources ?? [];

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    sources.forEach((s: any) => {
      const k = s.knowledge_layer === "program"
        ? `Program · ${s.program_code ?? "—"}`
        : s.knowledge_layer === "state"
        ? `State · ${s.state_code ?? "—"}`
        : (s.knowledge_layer ?? "other").toUpperCase();
      (g[k] ??= []).push(s);
    });
    return g;
  }, [sources]);

  const readyIds = useMemo(
    () => sources.filter((s: any) => (s.authority_score ?? 0) >= 7 && s.source_url).map((s: any) => s.id),
    [sources],
  );

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
    });
  }

  async function act(status: "active" | "archived", ids?: string[]) {
    const t = ids ?? Array.from(selected);
    if (t.length === 0) return;
    if (status === "active" && t.length > 5 && !confirm(`Approve ${t.length} sources? This will begin ingestion.`)) return;
    setBusy(true); setMsg(null);
    try {
      await setFn({ data: { ids: t, status } });
      setMsg(`${status === "active" ? "Approved" : "Rejected"} ${t.length} source${t.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["olympus-review-queue"] });
      qc.invalidateQueries({ queryKey: ["olympus-review-queue-count"] });
      qc.invalidateQueries({ queryKey: ["sf-layer-counts"] });
    } catch (e: any) {
      setMsg(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Intelligence</div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-light tracking-wide">
            <Inbox size={22} /> Review Queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {sources.length === 0
              ? "● All clear. No pending proposals."
              : `${sources.length} source${sources.length === 1 ? "" : "s"} waiting for your review.`}
          </p>
        </div>
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => act("active", readyIds)}
              disabled={busy || readyIds.length === 0}
              className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "#C49A22", color: "#0b0b0b" }}
            >
              ✓ Approve All Ready ({readyIds.length})
            </button>
            <button
              onClick={() => act("active")}
              disabled={busy || selected.size === 0}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-40"
            >
              Approve selected ({selected.size})
            </button>
            <button
              onClick={() => act("archived")}
              disabled={busy || selected.size === 0}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20 disabled:opacity-40"
            >
              Reject selected
            </button>
          </div>
        )}
      </header>

      {msg && <div className="mb-4 rounded border border-border bg-surface px-3 py-2 text-sm">{msg}</div>}

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : sources.length === 0 ? (
        <EmptyState
          variant="green"
          icon={<EmptyIcon name="check" />}
          title="All clear."
          description="No source proposals waiting for review. IRIS will notify you when new sources are found."
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  {group} · {items.length}
                </h2>
                <button
                  onClick={() => setSelected((s) => { const n = new Set(s); items.forEach((it: any) => n.add(it.id)); return n; })}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Select group
                </button>
              </div>
              <div className="space-y-2">
                {items.map((s: any) => {
                  const sel = selected.has(s.id);
                  const ready = (s.authority_score ?? 0) >= 7 && s.source_url;
                  return (
                    <div
                      key={s.id}
                      className="flex items-start gap-3 rounded-lg border p-4"
                      style={{
                        background: sel ? "rgba(196,154,34,0.05)" : "transparent",
                        borderColor: sel ? "rgba(196,154,34,0.4)" : "hsl(var(--border))",
                      }}
                    >
                      <input type="checkbox" checked={sel} onChange={() => toggle(s.id)} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-mono"
                            style={{ background: "rgba(34,211,238,0.15)", color: "var(--iris, #22d3ee)" }}
                          >
                            {s.authority_score ?? "?"}/10
                          </span>
                          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {s.knowledge_layer}
                          </span>
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px]"
                            style={{
                              background: ready ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                              color: ready ? "rgb(134,239,172)" : "#f59e0b",
                            }}
                          >
                            {ready ? "● Ready" : "⚠ Review"}
                          </span>
                          <span className="text-sm font-medium">{s.source_title}</span>
                        </div>
                        {s.issuing_authority && (
                          <div className="mt-1 text-[11px] text-muted-foreground">{s.issuing_authority}</div>
                        )}
                        {s.summary && <p className="mt-1.5 text-[12px] text-muted-foreground">{s.summary}</p>}
                        {s.source_url && (
                          <a
                            href={s.source_url}
                            target="_blank"
                            rel="noopener"
                            className="mt-1.5 inline-block text-[11px] hover:underline"
                            style={{ color: "var(--iris, #22d3ee)" }}
                          >
                            {s.source_url}
                          </a>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => act("active", [s.id])}
                          disabled={busy}
                          className="rounded-md p-1.5 text-green-400 hover:bg-green-500/10"
                          title="Approve"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => act("archived", [s.id])}
                          disabled={busy}
                          className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"
                          title="Reject"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
