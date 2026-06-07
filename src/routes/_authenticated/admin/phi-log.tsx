// S-5 + S-6: PHI rejection log with name resolution, status + review workflow.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Download, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { reviewPhiRejection } from "@/lib/phi-review.functions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/admin/phi-log")({
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
  status: string;
  resolution_type: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  document_name: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  unreviewed: "bg-amber-500/15 text-amber-500",
  reviewed: "bg-emerald-500/15 text-emerald-500",
  escalated: "bg-red-500/15 text-red-500",
  resolved: "bg-sky-500/15 text-sky-500",
};

const RESOLUTION_LABEL: Record<string, string> = {
  no_action: "No action needed",
  document_removed: "Document removed",
  user_notified: "User notified",
  escalated_compliance: "Escalated to compliance",
};

function PhiLogPage() {
  const qc = useQueryClient();
  const reviewFn = useServerFn(reviewPhiRejection);

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

  // Resolve actor + reviewer profiles.
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.actor_user_id) ids.add(r.actor_user_id);
      if (r.reviewed_by) ids.add(r.reviewed_by);
    }
    return Array.from(ids);
  }, [rows]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["phi-log-profiles", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .in("id", userIds);
      return data ?? [];
    },
  });

  const nameMap = useMemo(() => {
    const m = new Map<string, { name: string; email: string | null }>();
    for (const p of profiles) {
      m.set(p.id, { name: (p.display_name as string) ?? (p.email as string) ?? "Unknown", email: p.email as string | null });
    }
    return m;
  }, [profiles]);

  function actorLabel(r: Row) {
    if (!r.actor_user_id) {
      if (r.surface === "iris_ingest" || r.surface === "rfp_parser" || r.surface === "document_extraction") {
        return { name: "IRIS System", email: "automated process" };
      }
      return { name: "System", email: "—" };
    }
    return nameMap.get(r.actor_user_id) ?? { name: r.actor_user_id.slice(0, 8) + "…", email: null };
  }

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const visible = useMemo(
    () => (statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter)),
    [rows, statusFilter],
  );

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const unreviewed = rows.filter((r) => r.status === "unreviewed").length;
    const reviewedThisMonth = rows.filter(
      (r) => r.status !== "unreviewed" && r.reviewed_at && new Date(r.reviewed_at) >= monthStart,
    ).length;
    return { unreviewed, reviewedThisMonth };
  }, [rows]);

  function exportCsv() {
    const header = ["When", "Actor", "Actor Email", "Document", "Surface", "Patterns", "Confidence", "Status", "Resolution", "Reviewed By", "Reviewed At", "Note"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const actor = actorLabel(r);
      const reviewer = r.reviewed_by ? (nameMap.get(r.reviewed_by)?.name ?? r.reviewed_by) : "";
      const cells = [
        new Date(r.created_at).toISOString(),
        actor.name,
        actor.email ?? "",
        r.document_name ?? "",
        r.surface,
        (r.patterns_matched ?? []).join(";"),
        r.confidence ?? "",
        r.status,
        r.resolution_type ? RESOLUTION_LABEL[r.resolution_type] ?? r.resolution_type : "",
        reviewer,
        r.reviewed_at ? new Date(r.reviewed_at).toISOString() : "",
        r.review_note ?? "",
      ].map((v) => {
        const s = String(v ?? "");
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      });
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phi-rejections-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Review side-panel
  const [reviewRow, setReviewRow] = useState<Row | null>(null);
  const [revStatus, setRevStatus] = useState<Row["status"]>("reviewed");
  const [revResolution, setRevResolution] = useState<string>("no_action");
  const [revNote, setRevNote] = useState<string>("");

  function openReview(r: Row) {
    setReviewRow(r);
    setRevStatus(r.status === "unreviewed" ? "reviewed" : (r.status as any));
    setRevResolution(r.resolution_type ?? "no_action");
    setRevNote(r.review_note ?? "");
  }

  async function submitReview() {
    if (!reviewRow) return;
    try {
      await reviewFn({
        data: {
          id: reviewRow.id,
          status: revStatus as any,
          resolution_type: revResolution as any,
          review_note: revNote || null,
        },
      });
      toast.success("Review saved");
      setReviewRow(null);
      qc.invalidateQueries({ queryKey: ["phi-rejection-log"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save review");
    }
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

      {/* Summary banner */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Stat label="Unreviewed" value={stats.unreviewed} tone={stats.unreviewed > 0 ? "warn" : "ok"} />
        <Stat label="Reviewed this month" value={stats.reviewedThisMonth} tone="ok" />
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-surface p-1">
          {(["all", "unreviewed", "reviewed", "escalated", "resolved"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`rounded px-2.5 py-1 text-[11px] uppercase tracking-wider ${statusFilter === s ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <ShieldAlert className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No PHI rejections in this view.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-3 py-3 text-left w-40">When</th>
                <th className="px-3 py-3 text-left w-28">Surface</th>
                <th className="px-3 py-3 text-left">Document</th>
                <th className="px-3 py-3 text-left">Patterns</th>
                <th className="px-3 py-3 text-left w-44">Actor</th>
                <th className="px-3 py-3 text-left w-28">Status</th>
                <th className="px-3 py-3 text-right w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((r) => {
                const actor = actorLabel(r);
                return (
                  <tr key={r.id} className="hover:bg-surface-hover">
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground tabular-nums">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="rounded bg-surface-hover px-2 py-0.5 font-mono text-[10px]">{r.surface}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] truncate max-w-[200px]" title={r.document_name ?? ""}>
                      {r.document_name ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">{(r.patterns_matched ?? []).join(", ")}</td>
                    <td className="px-3 py-2.5">
                      <div className="text-[12px] font-medium">{actor.name}</div>
                      {actor.email && <div className="text-[10px] text-muted-foreground">{actor.email}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_STYLE[r.status] ?? "bg-surface-hover text-muted-foreground"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => openReview(r)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium hover:bg-surface-hover">
                        <CheckCircle2 className="h-3 w-3" />
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Sheet open={!!reviewRow} onOpenChange={(o) => !o && setReviewRow(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Review PHI detection</SheetTitle>
            <SheetDescription>
              {reviewRow && new Date(reviewRow.created_at).toLocaleString()} · {reviewRow?.surface}
            </SheetDescription>
          </SheetHeader>
          {reviewRow && (
            <div className="mt-6 space-y-4">
              <Field label="Document">
                <div className="text-sm">{reviewRow.document_name ?? "—"}</div>
              </Field>
              <Field label="Patterns matched">
                <div className="text-sm">{(reviewRow.patterns_matched ?? []).join(", ") || "—"}</div>
              </Field>
              <Field label="Actor">
                <div className="text-sm">{actorLabel(reviewRow).name}</div>
              </Field>

              <Field label="Status">
                <select value={revStatus} onChange={(e) => setRevStatus(e.target.value as any)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
                  <option value="reviewed">Reviewed</option>
                  <option value="escalated">Escalated</option>
                  <option value="resolved">Resolved</option>
                  <option value="unreviewed">Unreviewed (reset)</option>
                </select>
              </Field>

              <Field label="Resolution">
                <select value={revResolution} onChange={(e) => setRevResolution(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm">
                  <option value="no_action">No action needed</option>
                  <option value="document_removed">Document removed</option>
                  <option value="user_notified">User notified</option>
                  <option value="escalated_compliance">Escalated to compliance</option>
                </select>
              </Field>

              <Field label="Note">
                <textarea rows={4} value={revNote} onChange={(e) => setRevNote(e.target.value)}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm" />
              </Field>

              {reviewRow.reviewed_at && (
                <p className="text-[11px] text-muted-foreground">
                  Last reviewed {new Date(reviewRow.reviewed_at).toLocaleString()}
                  {reviewRow.reviewed_by && nameMap.get(reviewRow.reviewed_by) ? ` by ${nameMap.get(reviewRow.reviewed_by)!.name}` : ""}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setReviewRow(null)}
                  className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs">Cancel</button>
                <button onClick={submitReview}
                  className="flex-1 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background hover:opacity-90">
                  Save review
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  return (
    <div className={`rounded-md border px-4 py-2 ${tone === "warn" && value > 0 ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-surface"}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
