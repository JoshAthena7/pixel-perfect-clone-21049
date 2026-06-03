import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Library, Search, ExternalLink, AlertTriangle } from "lucide-react";
import { listAtlasSources, layerCounts } from "@/lib/atlas-sources.functions";

export const Route = createFileRoute("/_authenticated/olympus/source-library")({
  component: SourceLibraryPage,
});

const LAYER_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  canon: { bg: "rgba(196,154,34,0.18)", fg: "#C49A22", label: "Canon" },
  state: { bg: "rgba(56,189,248,0.18)", fg: "#7dd3fc", label: "State" },
  program: { bg: "rgba(20,184,166,0.18)", fg: "#5eead4", label: "Program" },
  mission: { bg: "rgba(217,70,239,0.18)", fg: "#f0abfc", label: "Mission" },
  collective: { bg: "rgba(168,85,247,0.18)", fg: "#d8b4fe", label: "Collective" },
};

function SourceLibraryPage() {
  const [layer, setLayer] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");

  const list = useServerFn(listAtlasSources);
  const counts = useServerFn(layerCounts);

  const { data: srcData, isLoading } = useQuery({
    queryKey: ["lib-sources", layer, search],
    queryFn: () => list({ data: { layer: layer as any, search: search || undefined } }),
  });
  const { data: countMap = {} as Record<string, number> } = useQuery({
    queryKey: ["lib-counts"],
    queryFn: () => counts({ data: {} }),
  });

  const sources = srcData?.sources ?? [];
  const total = useMemo(
    () => Object.values(countMap as any).reduce((a: number, b: any) => a + (b ?? 0), 0),
    [countMap],
  );
  const layersWithData = useMemo(
    () => Object.entries(countMap as any).filter(([, n]) => (n as number) > 0).length,
    [countMap],
  );
  const needsReview = sources.filter((s: any) => s.needs_human_review).length;

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Intelligence</div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-light tracking-wide">
          <Library size={22} /> Source Library
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {total} total sources across {layersWithData} knowledge layers.
        </p>
      </header>

      {needsReview > 0 && (
        <div
          className="mb-4 flex items-center justify-between rounded-md border px-4 py-3 text-sm"
          style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.06)", color: "#fbbf24" }}
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {needsReview} sources need your attention
          </span>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(["canon", "state", "program", "mission", "collective"] as const).map((k) => {
          const meta = LAYER_BADGE[k];
          const active = layer === k;
          return (
            <button
              key={k}
              onClick={() => setLayer(active ? undefined : k)}
              className="rounded-lg border p-3 text-left transition-colors"
              style={{
                borderColor: active ? meta.fg : "hsl(var(--border))",
                background: active ? meta.bg : "transparent",
              }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: meta.fg }}>
                {meta.label}
              </div>
              <div className="mt-1 text-lg font-medium">{(countMap as any)[k] ?? 0}</div>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or summary…"
            className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm"
          />
        </div>
        {layer && (
          <button onClick={() => setLayer(undefined)} className="text-xs text-muted-foreground hover:text-foreground">
            Clear layer
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Layer</th>
              <th className="px-3 py-2 text-left">Title</th>
              <th className="px-3 py-2 text-left">Authority</th>
              <th className="px-3 py-2 text-left">Issuing Authority</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Ingested</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : sources.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No sources match.</td></tr>
            ) : sources.map((s: any) => {
              const meta = LAYER_BADGE[s.knowledge_layer] ?? LAYER_BADGE.canon;
              return (
                <tr key={s.id} className="border-t border-border hover:bg-surface/40">
                  <td className="px-3 py-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: meta.bg, color: meta.fg }}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.source_title}</div>
                    {s.source_url && (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noopener"
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:underline"
                      >
                        <ExternalLink size={10} /> Open
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{s.authority_score ?? "—"}/10</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.issuing_authority ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{s.library_category ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="capitalize text-muted-foreground">{s.status ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground">
                    {s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        Manage sources granularly in{" "}
        <Link to="/olympus/atlas-sources" className="underline hover:text-foreground">Atlas Sources</Link>.
      </div>
    </div>
  );
}
