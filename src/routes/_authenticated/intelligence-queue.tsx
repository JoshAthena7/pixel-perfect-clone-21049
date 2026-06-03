import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, X, Loader2, Sparkles, Inbox, ArrowLeft } from "lucide-react";
import { listReviewQueue, setSourceStatus } from "@/lib/atlas-onboarding.functions";

export const Route = createFileRoute("/_authenticated/intelligence-queue")({
  component: ReviewQueue,
});

function ReviewQueue() {
  const qc = useQueryClient();
  const listFn = useServerFn(listReviewQueue);
  const setFn = useServerFn(setSourceStatus);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["atlas-review-queue"],
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
        : s.knowledge_layer.toUpperCase();
      (g[k] ??= []).push(s);
    });
    return g;
  }, [sources]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function act(status: "active" | "archived", ids?: string[]) {
    const targetIds = ids ?? Array.from(selected);
    if (targetIds.length === 0) return;
    setBusy(true); setMessage(null);
    try {
      await setFn({ data: { ids: targetIds, status } });
      setMessage(`${status === "active" ? "Approved" : "Rejected"} ${targetIds.length} source${targetIds.length === 1 ? "" : "s"}.`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["atlas-review-queue"] });
      qc.invalidateQueries({ queryKey: ["atlas-hub-stats"] });
      qc.invalidateQueries({ queryKey: ["atlas-sources"] });
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-56px)]" style={{ background: "#060b14" }}>
      <div className="mx-auto max-w-[1200px] px-8 py-10">
        <Link to="/intelligence" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Back to Intelligence Hub
        </Link>

        <div className="mt-4 flex items-start justify-between gap-6">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-400">CLASSIFIED</span>
            <h1 className="mt-2 text-white text-3xl font-light tracking-wider uppercase">
              <Inbox className="inline -mt-1 mr-2" size={26} /> Review Queue
            </h1>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              IRIS-discovered sources awaiting Admin approval. Approved sources become available to IRIS across every mission.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => act("active", sources.map((s: any) => s.id))}
              disabled={busy || sources.length === 0}
              className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--athena-gold, #f59e0b)", color: "#0b0b0b" }}
            >
              {busy ? <Loader2 className="inline h-4 w-4 animate-spin" /> : "Approve all"}
            </button>
            <button
              onClick={() => act("active")}
              disabled={busy || selected.size === 0}
              className="rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm hover:bg-white/[0.08] disabled:opacity-40"
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
        </div>

        {message && (
          <div className="mt-4 rounded border border-white/10 bg-white/5 px-3 py-2 text-sm">{message}</div>
        )}

        <div className="mt-8 space-y-8">
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
            Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{group} · {items.length}</h2>
                  <button
                    onClick={() => setSelected((s) => {
                      const n = new Set(s); items.forEach((it: any) => n.add(it.id)); return n;
                    })}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >Select group</button>
                </div>
                <div className="space-y-2">
                  {items.map((s: any) => {
                    const sel = selected.has(s.id);
                    return (
                      <div
                        key={s.id}
                        className="flex items-start gap-3 rounded-lg border p-4 transition-colors"
                        style={{
                          background: sel ? "rgba(245,158,11,0.05)" : "rgba(255,255,255,0.02)",
                          borderColor: sel ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.08)",
                        }}
                      >
                        <input type="checkbox" checked={sel} onChange={() => toggle(s.id)} className="mt-1" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{s.source_title}</span>
                            <span className="rounded bg-[color:var(--iris,#22d3ee)]/15 px-1.5 py-0.5 text-[10px] font-mono text-[color:var(--iris,#22d3ee)]">
                              {s.authority_score ?? "?"}/10
                            </span>
                            {s.library_category && (
                              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {s.library_category}
                              </span>
                            )}
                          </div>
                          {s.issuing_authority && (
                            <div className="mt-1 text-[11px] text-muted-foreground">{s.issuing_authority}</div>
                          )}
                          {s.summary && <p className="mt-1.5 text-[12px] text-muted-foreground">{s.summary}</p>}
                          {s.source_url && (
                            <a href={s.source_url} target="_blank" rel="noopener" className="mt-1.5 inline-block text-[11px] text-[color:var(--iris,#22d3ee)] hover:underline">
                              {s.source_url}
                            </a>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => act("active", [s.id])}
                            disabled={busy}
                            className="rounded-md p-1.5 text-green-400 hover:bg-green-500/10"
                            title="Approve"
                          ><Check size={16} /></button>
                          <button
                            onClick={() => act("archived", [s.id])}
                            disabled={busy}
                            className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"
                            title="Reject"
                          ><X size={16} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
