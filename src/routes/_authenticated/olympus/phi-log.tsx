// H3: Read-only PHI rejection log viewer (Olympus → Security).
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/olympus/phi-log")({
  component: PhiLogPage,
});

type Row = {
  id: string;
  actor_user_id: string | null;
  engagement_id: string | null;
  surface: string;
  patterns_matched: string[];
  confidence: string | null;
  created_at: string;
};

function PhiLogPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["phi-rejection-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("phi_rejection_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      return (data ?? []) as Row[];
    },
  });

  function exportCsv() {
    const header = ["When", "Actor", "Engagement", "Surface", "Patterns", "Confidence"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        new Date(r.created_at).toISOString(),
        r.actor_user_id ?? "",
        r.engagement_id ?? "",
        r.surface,
        (r.patterns_matched ?? []).join(";"),
        r.confidence ?? "",
      ].map((v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `phi-rejections-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Security</div>
          <h1 className="h1-display mt-1">PHI rejection log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every server-side block where Atlas detected potential protected health information. Metadata only — no content is stored.
          </p>
        </div>
        <button onClick={exportCsv} disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50">
          <Download className="h-3 w-3" /> Export CSV
        </button>
      </header>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <ShieldAlert className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No PHI rejections recorded. (This is good news.)
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left w-44">When</th>
                <th className="px-4 py-3 text-left w-32">Surface</th>
                <th className="px-4 py-3 text-left">Patterns</th>
                <th className="px-4 py-3 text-left w-28">Confidence</th>
                <th className="px-4 py-3 text-left">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-2.5 text-[11px] text-muted-foreground tabular-nums">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-surface-hover px-2 py-0.5 font-mono text-[10px]">{r.surface}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[12px]">{(r.patterns_matched ?? []).join(", ")}</td>
                  <td className="px-4 py-2.5 text-[12px]">{r.confidence ?? "—"}</td>
                  <td className="px-4 py-2.5 text-[10px] font-mono text-muted-foreground">{r.actor_user_id ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
