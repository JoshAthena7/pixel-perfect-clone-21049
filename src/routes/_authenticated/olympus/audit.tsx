import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { relativeTime } from "@/lib/signals";
import { Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/olympus/audit")({
  component: AuditPage,
});

type AuditRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  mission_id: string | null;
  action_type: string;
  action_summary: string;
};

function AuditPage() {
  const { data: audit = [], isLoading } = useQuery({
    queryKey: ["olympus-audit-page"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("olympus_audit_log")
        .select("id,created_at,user_name,mission_id,action_type,action_summary")
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as AuditRow[];
    },
  });

  function exportCsv() {
    const header = "Timestamp,User,Action Type,Summary,Mission ID";
    const rows = audit.map((r) =>
      [r.created_at, r.user_name ?? "", r.action_type, r.action_summary.replace(/"/g, '""'), r.mission_id ?? ""]
        .map((v) => `"${v}"`).join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `olympus-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Audit Log</div>
          <h1 className="h1-display mt-1">Administrative Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every action taken in Olympus, in chronological order.</p>
        </div>
        <button onClick={exportCsv} disabled={audit.length === 0}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface-hover disabled:opacity-50">
          Export CSV
        </button>
      </header>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : audit.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-60" />
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {audit.map((row) => (
              <li key={row.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{row.action_summary}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.user_name ?? "—"} · {row.action_type}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0">{relativeTime(row.created_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
