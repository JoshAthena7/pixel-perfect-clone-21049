import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAtlasSources, layerCounts, upsertAtlasSource, deleteAtlasSource,
  promoteAtlasSource, suggestLayer,
} from "@/lib/atlas-sources.functions";
import {
  Layers, Plus, Search, ExternalLink, ArrowUp, Trash2, X, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/atlas-sources")({
  component: AtlasSourcesPage,
});

type LayerKey = "all" | "canon" | "state" | "program" | "mission";

const LAYER_META: Record<Exclude<LayerKey, "all">, { label: string; sub: string; cls: string; badge: string }> = {
  canon:   { label: "Canon",    sub: "Federal + Athena",     cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",   badge: "CANON" },
  state:   { label: "NJ State", sub: "New Jersey",           cls: "border-sky-500/40 bg-sky-500/10 text-sky-300",         badge: "NJ STATE" },
  program: { label: "NJ CSOC",  sub: "Program",              cls: "border-teal-500/40 bg-teal-500/10 text-teal-300",      badge: "NJ CSOC" },
  mission: { label: "Mission",  sub: "Active bid",           cls: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300", badge: "2026" },
};

function AtlasSourcesPage() {
  const [layer, setLayer] = useState<LayerKey>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const list = useServerFn(listAtlasSources);
  const counts = useServerFn(layerCounts);
  const del = useServerFn(deleteAtlasSource);
  const promote = useServerFn(promoteAtlasSource);
  const qc = useQueryClient();

  const { data: sourcesData, isLoading } = useQuery({
    queryKey: ["atlas-sources", layer, search],
    queryFn: () => list({ data: { layer: layer === "all" ? undefined : layer, search: search || undefined } }),
  });
  const sources = sourcesData?.sources ?? [];

  const { data: countMap = {} as Record<string, number> } = useQuery({
    queryKey: ["atlas-counts"],
    queryFn: () => counts({ data: {} }),
  });

  const totalLayers = useMemo(() =>
    ["canon", "state", "program", "mission"].filter((l) => (countMap as any)[l] > 0).length,
    [countMap],
  );

  const removeMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atlas-sources"] });
      qc.invalidateQueries({ queryKey: ["atlas-counts"] });
    },
  });
  const promoteMut = useMutation({
    mutationFn: (id: string) => promote({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["atlas-sources"] });
      qc.invalidateQueries({ queryKey: ["atlas-counts"] });
    },
  });

  return (
    <div className="flex h-full min-h-0">
      {/* Left rail */}
      <aside className="w-56 shrink-0 border-r border-border bg-surface/40 p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">
          Knowledge Layer
        </div>
        <div className="mt-3 space-y-1">
          <LayerRadio active={layer === "all"} onClick={() => setLayer("all")} label="All Layers" />
          {(["canon", "state", "program", "mission"] as const).map((l) => (
            <LayerRadio
              key={l}
              active={layer === l}
              onClick={() => setLayer(l)}
              label={LAYER_META[l].label}
              sub={LAYER_META[l].sub}
              count={(countMap as any)[l] ?? 0}
              dotCls={LAYER_META[l].cls}
            />
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 px-8 py-8 overflow-y-auto">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">
          <Layers className="h-3 w-3" /> Atlas Source Library
        </div>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">NJ CSOC Sources</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every source is permanently assigned to a knowledge layer. Layer determines reuse, retention, and IRIS retrieval order.
            </p>
          </div>
          <button
            onClick={() => { setEditing(null); setCreating(true); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25"
          >
            <Plus className="h-3.5 w-3.5" /> Add Source
          </button>
        </div>

        {/* Search + summary */}
        <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sources…"
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{sources.length}</span> sources across{" "}
            <span className="font-medium text-foreground">{totalLayers}</span> knowledge layers
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["canon", "state", "program", "mission"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition ${LAYER_META[l].cls} ${layer === l ? "ring-1 ring-current" : "opacity-80 hover:opacity-100"}`}
            >
              {LAYER_META[l].badge}: {(countMap as any)[l] ?? 0}
            </button>
          ))}
        </div>

        {/* Cards */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {isLoading && <div className="text-sm text-muted-foreground">One moment…</div>}
          {!isLoading && sources.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
              No sources at this layer yet.
            </div>
          )}
          {sources.map((s: any) => (
            <SourceCard
              key={s.id}
              s={s}
              onEdit={() => { setCreating(false); setEditing(s); }}
              onDelete={() => removeMut.mutate(s.id)}
              onPromote={() => promoteMut.mutate(s.id)}
            />
          ))}
        </div>
      </div>

      {(creating || editing) && (
        <SourceFormDrawer
          existing={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            setCreating(false); setEditing(null);
            qc.invalidateQueries({ queryKey: ["atlas-sources"] });
            qc.invalidateQueries({ queryKey: ["atlas-counts"] });
          }}
        />
      )}
    </div>
  );
}

function LayerRadio({ active, onClick, label, sub, count, dotCls }: {
  active: boolean; onClick: () => void; label: string; sub?: string; count?: number; dotCls?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition ${
        active ? "border-cyan-500/40 bg-cyan-500/[0.06]" : "border-transparent hover:bg-surface-hover"
      }`}
    >
      <span className={`inline-block h-2 w-2 rounded-full border ${dotCls ?? "border-muted-foreground/40"}`} />
      <span className="flex-1">
        <span className="block font-medium text-foreground">{label}</span>
        {sub && <span className="block text-[10px] text-muted-foreground">{sub}</span>}
      </span>
      {typeof count === "number" && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

function SourceCard({ s, onEdit, onDelete, onPromote }: { s: any; onEdit: () => void; onDelete: () => void; onPromote: () => void }) {
  const layer = (s.knowledge_layer as Exclude<LayerKey, "all">) ?? "canon";
  const meta = LAYER_META[layer] ?? LAYER_META.canon;
  return (
    <div className="rounded-[10px] border border-border bg-card p-4 hover:border-cyan-500/30 transition">
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.cls}`}>
          {meta.badge} {s.authority_score ?? "?"}/10
        </span>
        <div className="flex items-center gap-1 opacity-70">
          {layer !== "canon" && (
            <button title="Promote layer" onClick={onPromote} className="rounded p-1 hover:bg-surface-hover">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
          )}
          <button title="Delete" onClick={onDelete} className="rounded p-1 hover:bg-surface-hover">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <button onClick={onEdit} className="mt-2 block w-full text-left">
        <div className="text-sm font-semibold text-foreground">{s.source_title}</div>
        {s.issuing_authority && <div className="text-[11px] text-muted-foreground">{s.issuing_authority}</div>}
        {s.summary && <p className="mt-2 line-clamp-3 text-[12px] text-muted-foreground">{s.summary}</p>}
      </button>
      <div className="mt-3 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{s.library_category ?? s.source_type ?? "—"}</span>
        {s.source_url && (
          <a href={s.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:underline">
            Open <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function SourceFormDrawer({ existing, onClose, onSaved }: { existing: any | null; onClose: () => void; onSaved: () => void }) {
  const upsert = useServerFn(upsertAtlasSource);
  const suggest = useServerFn(suggestLayer);

  const [layer, setLayer] = useState<"canon" | "state" | "program" | "mission">(existing?.knowledge_layer ?? "canon");
  const [title, setTitle] = useState(existing?.source_title ?? "");
  const [url, setUrl] = useState(existing?.source_url ?? "");
  const [authority, setAuthority] = useState<number>(existing?.authority_score ?? 8);
  const [category, setCategory] = useState(existing?.library_category ?? "");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [issuing, setIssuing] = useState(existing?.issuing_authority ?? "");
  const [suggestion, setSuggestion] = useState<null | { layer: string; reason: string; stateCode: string | null; programCode: string | null }>(null);
  const [saving, setSaving] = useState(false);

  async function runSuggest() {
    if (!url && !title) return;
    const s = await suggest({ data: { url, title } });
    setSuggestion(s);
  }

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: {
          id: existing?.id,
          knowledge_layer: layer,
          source_title: title,
          source_url: url || undefined,
          authority_score: authority,
          library_category: category || undefined,
          summary: summary || undefined,
          issuing_authority: issuing || undefined,
          state_code: layer === "canon" ? null : "NJ",
          program_code: layer === "program" || layer === "mission" ? "NJ_CSOC" : null,
        },
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const OPTIONS: Array<{ key: typeof layer; title: string; sub: string }> = [
    { key: "canon",   title: "Athena Canon",                 sub: "Federal regulations, CMS guidance, Athena playbooks. Available to all missions forever." },
    { key: "state",   title: "State Intelligence — NJ",      sub: "NJ-specific sources. Available to all NJ missions." },
    { key: "program", title: "Program Intelligence — NJ CSOC", sub: "NJ CSOC program sources. Available to all NJ CSOC bids." },
    { key: "mission", title: "Mission Intelligence — 2026 Bid", sub: "Specific to current bid. Archives when mission closes." },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-xl flex-col border-l border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-sm font-semibold">{existing ? "Edit Source" : "Add Atlas Source"}</div>
          <button onClick={onClose} className="rounded p-1 hover:bg-surface-hover"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Layer */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">Knowledge Layer <span className="text-rose-400">*</span></div>
            <div className="mt-2 space-y-2">
              {OPTIONS.map((o) => (
                <label key={o.key} className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition ${layer === o.key ? "border-cyan-500/40 bg-cyan-500/[0.06]" : "border-border hover:bg-surface-hover"}`}>
                  <input type="radio" checked={layer === o.key} onChange={() => setLayer(o.key)} className="mt-1" />
                  <div>
                    <div className="font-medium">{o.title}</div>
                    <div className="text-[11px] text-muted-foreground">{o.sub}</div>
                  </div>
                </label>
              ))}
            </div>
            {suggestion && (
              <div className="mt-2 flex items-start gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/[0.06] px-3 py-2 text-[11px] text-cyan-200">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                <div>
                  <span className="font-semibold">IRIS suggests:</span> {suggestion.layer.toUpperCase()}.{" "}
                  <span className="text-muted-foreground">{suggestion.reason}</span>{" "}
                  {suggestion.layer !== layer && (
                    <button onClick={() => setLayer(suggestion.layer as any)} className="ml-1 underline">Apply</button>
                  )}
                </div>
              </div>
            )}
          </div>

          <Field label="Source Title *"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></Field>
          <Field label="URL">
            <div className="flex gap-2">
              <input value={url} onChange={(e) => setUrl(e.target.value)} onBlur={runSuggest} placeholder="https://…" className={inputCls} />
              <button type="button" onClick={runSuggest} className="rounded-md border border-border px-2 text-xs hover:bg-surface-hover">IRIS suggest</button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Issuing Authority"><input value={issuing} onChange={(e) => setIssuing(e.target.value)} className={inputCls} /></Field>
            <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label={`Authority Score (${authority}/10)`}>
            <input type="range" min={1} max={10} value={authority} onChange={(e) => setAuthority(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label="Summary"><textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className={inputCls} /></Field>
        </div>
        <div className="border-t border-border px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-hover">Cancel</button>
          <button disabled={saving || !title} onClick={save} className="rounded-md bg-cyan-500/20 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50">
            {saving ? "Saving…" : existing ? "Save Changes" : "Add Source"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/30";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </label>
  );
}
