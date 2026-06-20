import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useIsAdmin, downloadCsv, slugForFilename } from "@/lib/mission-helpers";

type Entry = {
  id: string;
  mission_id: string;
  action: string;
  performed_by_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const PAGE_SIZE = 50;

export function AuditLogTab({ missionId, missionName }: { missionId: string; missionName: string }) {
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const [page, setPage] = useState(0);
  const [fromDate, setFromDate] = useState<Date | undefined>();
  const [toDate, setToDate] = useState<Date | undefined>();
  const [actionFilter, setActionFilter] = useState("all");
  const [performerFilter, setPerformerFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: all, isLoading, isError, refetch } = useQuery({
    queryKey: ["audit-log", missionId],
    enabled: !!isAdmin,
    queryFn: async () => {
      // Cap at 2000 most-recent entries to keep client-side filter/export bounded.
      const { data, error } = await supabase
        .from("mission_audit_log")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: false })
        .range(0, 1999);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const actions = useMemo(() => {
    const s = new Set<string>();
    (all ?? []).forEach((e) => s.add(e.action));
    return Array.from(s);
  }, [all]);

  const performers = useMemo(() => {
    const s = new Set<string>();
    (all ?? []).forEach((e) => e.performed_by_name && s.add(e.performed_by_name));
    return Array.from(s);
  }, [all]);

  const filtered = useMemo(() => {
    return (all ?? []).filter((e) => {
      const t = new Date(e.created_at);
      if (fromDate && t < fromDate) return false;
      if (toDate && t > new Date(toDate.getTime() + 86400000)) return false;
      if (actionFilter !== "all" && e.action !== actionFilter) return false;
      if (performerFilter !== "all" && e.performed_by_name !== performerFilter) return false;
      return true;
    });
  }, [all, fromDate, toDate, actionFilter, performerFilter]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const onExport = () => {
    const rows = filtered.map((e) => ({
      timestamp: e.created_at,
      action: e.action,
      performed_by: e.performed_by_name ?? "",
      metadata: JSON.stringify(e.metadata ?? {}),
    }));
    downloadCsv(`${slugForFilename(missionName)}-audit-log-${format(new Date(), "yyyy-MM-dd")}.csv`, rows);
  };

  if (roleLoading || isLoading) return <SkeletonRows rows={6} height="h-12" />;
  if (isError) return <ErrorState message="Couldn't load the audit log." onRetry={() => refetch()} />;
  if (!isAdmin) {
    return (
      <EmptyState
        title="Admin only"
        description="The audit log is restricted to mission administrators."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-medium">Audit Log</h2>
        <p className="text-[14px] text-muted-foreground mt-1">
          A complete record of every action taken on this mission. Read-only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <DateButton label="From" date={fromDate} setDate={setFromDate} />
        <DateButton label="To" date={toDate} setDate={setToDate} />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={performerFilter} onValueChange={setPerformerFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Performers</SelectItem>
            {performers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onExport}>
          <Download className="size-4 mr-1" />Export Audit Log
        </Button>
      </div>

      {pageRows.length === 0 ? (
        <EmptyState
          title="No audit entries yet"
          description="Mission activity will appear here as the team takes actions."
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-muted/40 text-[12px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Timestamp</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Performed By</th>
                <th className="px-3 py-2 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((e) => {
                const isExp = expanded.has(e.id);
                const hasMeta = e.metadata && Object.keys(e.metadata).length > 0;
                return (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {format(new Date(e.created_at), "MMM d, yyyy 'at' h:mm a")}
                    </td>
                    <td className="px-3 py-2">{e.action}</td>
                    <td className="px-3 py-2">{e.performed_by_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      {hasMeta ? (
                        <>
                          <button
                            className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              const n = new Set(expanded);
                              n.has(e.id) ? n.delete(e.id) : n.add(e.id);
                              setExpanded(n);
                            }}
                          >
                            {isExp ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                            {isExp ? "Hide" : "Show"}
                          </button>
                          {isExp && (
                            <div className="mt-2 space-y-0.5 text-[12px]">
                              {Object.entries(e.metadata!).map(([k, v]) => (
                                <div key={k}>
                                  <span className="text-muted-foreground">{k}:</span>{" "}
                                  <span className="font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : <span className="text-muted-foreground text-[12px]">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-[14px]">
        <span className="text-muted-foreground">
          Page {page + 1} of {totalPages} ({filtered.length} entries)
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function DateButton({ label, date, setDate }: { label: string; date: Date | undefined; setDate: (d: Date | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          {label}: {date ? format(date, "MMM d, yyyy") : "Any"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} onSelect={setDate} className="pointer-events-auto" />
        {date && (
          <div className="p-2 border-t">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setDate(undefined)}>Clear</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
