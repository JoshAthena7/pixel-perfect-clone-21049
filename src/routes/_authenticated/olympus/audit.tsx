import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History, Search, Filter, Download } from "lucide-react";
import { toast } from "sonner";
import { useSelectedOlympusMission } from "../olympus";

export const Route = createFileRoute("/_authenticated/olympus/audit")({
  component: AuditPage,
});

type Entry = {
  id: string;
  user_name: string | null;
  action_type: string;
  action_summary: string;
  target_table: string | null;
  mission_id: string | null;
  created_at: string;
  metadata: any;
};

function AuditPage() {
  const missionId = useSelectedOlympusMission();
  const [scope, setScope] = useState<"mission" | "all">("mission");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["olympus-audit", scope, missionId],
    queryFn: async () => {
      let q = supabase
        .from("olympus_audit_log")
        .select("id,user_name,action_type,action_summary,target_table,mission_id,created_at,metadata")
        .order("created_at", { ascending: false })
        .limit(500);
      if (scope === "mission" && missionId) q = q.eq("mission_id", missionId);
      const { data } = await q;
      return (data ?? []) as Entry[];
    },
  });

  const types = useMemo(() => Array.from(new Set(entries.map((e) => e.action_type))).sort(), [entries]);

  const visible = useMemo(() => {
    const fromTs = dateFrom ? new Date(dateFrom).getTime() : null;
    const toTs = dateTo ? new Date(dateTo).getTime() + 86400000 : null;
    return entries.filter((e) => {
      if (filterType !== "all" && e.action_type !== filterType) return false;
      const ts = new Date(e.created_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts >= toTs) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return e.action_summary.toLowerCase().includes(q) ||
        (e.user_name ?? "").toLowerCase().includes(q) ||
        e.action_type.toLowerCase().includes(q);
    });
  }, [entries, search, filterType, dateFrom, dateTo]);

  function exportCsv() {
    const header = ["When", "Who", "Action", "Summary", "Mission", "Target"];
    const lines = [header.join(",")];
    for (const e of visible) {
      const cells = [
        new Date(e.created_at).toISOString(),
        e.user_name ?? "", e.action_type, e.action_summary,
        e.mission_id ?? "", e.target_table ?? "",
      ].map((v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `olympus-audit-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("Exported CSV");
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Audit Log</div>
          <h1 className="h1-display mt-1">Activity History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every administrative action taken in Olympus.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            <button onClick={() => setScope("mission")}
              className={`rounded-sm px-3 py-1.5 text-xs ${scope === "mission" ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              This Mission
            </button>
            <button onClick={() => setScope("all")}
              className={`rounded-sm px-3 py-1.5 text-xs ${scope === "all" ? "bg-surface-hover text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              All Missions
            </button>
          </div>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search summary, user, or type…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs">
            <option value="all">All types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" title="From date" />
        <span className="text-[11px] text-muted-foreground">→</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs" title="To date" />
        <button onClick={exportCsv} disabled={visible.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-surface-hover disabled:opacity-50">
          <Download className="h-3 w-3" /> Export CSV
        </button>
      </div>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <History className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No audit entries match.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left w-40">When</th>
                <th className="px-4 py-3 text-left w-40">Who</th>
                <th className="px-4 py-3 text-left w-40">Action</th>
                <th className="px-4 py-3 text-left">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((e) => (
                <tr key={e.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-2.5 text-[11px] text-muted-foreground tabular-nums">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-[12px]">{e.user_name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-surface-hover px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {e.action_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{e.action_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {visible.length >= 500 && (
          <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
            Showing the most recent 500 entries.
          </div>
        )}
      </div>
    </div>
  );
}
