import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { listAtlasSources } from "@/lib/atlas-sources.functions";

export const Route = createFileRoute("/_authenticated/olympus/discovery-history")({
  component: DiscoveryHistoryPage,
});

type Row = {
  key: string;
  date: string;
  layer: string;
  scope: string;
  found: number;
  approved: number;
  rejected: number;
  pending: number;
};

function DiscoveryHistoryPage() {
  const list = useServerFn(listAtlasSources);
  const { data, isLoading } = useQuery({
    queryKey: ["discovery-history"],
    queryFn: () => list({ data: {} }),
  });
  const sources = data?.sources ?? [];

  const rows: Row[] = useMemo(() => {
    // Group by day + layer + scope (program_code/state_code) — best-effort sweep grouping.
    const groups: Record<string, any[]> = {};
    sources.forEach((s: any) => {
      if (!s.created_at) return;
      const day = new Date(s.created_at).toISOString().slice(0, 10);
      const scope = s.program_code ?? s.state_code ?? "—";
      const key = `${day}|${s.knowledge_layer}|${scope}`;
      (groups[key] ??= []).push(s);
    });
    return Object.entries(groups)
      .map(([key, items]) => {
        const [date, layer, scope] = key.split("|");
        const approved = items.filter((i) => i.status === "active").length;
        const pending = items.filter((i) => i.status === "under_review").length;
        const rejected = items.filter((i) => i.status === "archived").length;
        return {
          key, date, layer, scope,
          found: items.length, approved, rejected, pending,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [sources]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Intelligence</div>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-light tracking-wide">
          <History size={22} /> Discovery History
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every sweep IRIS has run and what it found.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Layer</th>
              <th className="px-3 py-2 text-left">Scope</th>
              <th className="px-3 py-2 text-right">Found</th>
              <th className="px-3 py-2 text-right">Approved</th>
              <th className="px-3 py-2 text-right">Pending</th>
              <th className="px-3 py-2 text-right">Rejected</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No discovery runs yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key} className="border-t border-border hover:bg-surface/40">
                <td className="px-3 py-2 font-mono text-xs">{r.date}</td>
                <td className="px-3 py-2 text-xs uppercase">{r.layer}</td>
                <td className="px-3 py-2 text-xs">{r.scope}</td>
                <td className="px-3 py-2 text-right text-xs">{r.found}</td>
                <td className="px-3 py-2 text-right text-xs text-green-400">{r.approved}</td>
                <td className="px-3 py-2 text-right text-xs text-amber-400">{r.pending}</td>
                <td className="px-3 py-2 text-right text-xs text-red-400">{r.rejected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
