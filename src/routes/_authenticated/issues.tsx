import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { useSession } from "@/hooks/use-session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill, type StatusColor } from "@/components/war-room/StatusPill";
import { ConfirmAction } from "@/components/war-room/ConfirmAction";
import { LoadingSkeleton, ErrorBanner } from "@/components/war-room/LoadState";
import { relativeTime } from "@/lib/time";
import { Siren, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity-log";

export const Route = createFileRoute("/_authenticated/issues")({
  head: () => ({ meta: [{ title: "Issues — Athena" }] }),
  component: IssuesPage,
});

type IssueType = "sos" | "risk";

type UnifiedIssue = {
  id: string;
  type: IssueType;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  ownerName: string | null;
  submitterName: string;
  recommendedAction: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

const SEV_RANK: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
function sevColor(s: string): StatusColor {
  if (s === "Critical") return "Red";
  if (s === "High") return "Orange";
  if (s === "Medium") return "Yellow";
  return "Green";
}
const OPEN_STATUSES = new Set(["Open", "Acknowledged", "Mitigating"]);
const CLOSED_STATUSES = new Set(["Resolved", "Closed"]);

function IssuesPage() {
  const { engagement, member, isLeadership } = useEngagement();
  const { user } = useSession();
  const [items, setItems] = useState<UnifiedIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"All" | IssueType>("All");
  const [sevFilter, setSevFilter] = useState<"All" | "Critical" | "High" | "Medium" | "Low">("All");
  const [statusFilter, setStatusFilter] = useState<"Open" | "Closed" | "All">("Open");

  async function load(eid: string) {
    setLoading(true);
    setLoadError(null);
    const [sos, risks] = await Promise.all([
      supabase.from("sos_alerts").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
      supabase.from("risks").select("*").eq("engagement_id", eid).order("created_at", { ascending: false }),
    ]);
    setLoading(false);
    const err = sos.error ?? risks.error;
    if (err) { setLoadError(err.message); return; }

    const u: UnifiedIssue[] = [
      ...((sos.data ?? []) as any[]).map((a) => ({
        id: a.id,
        type: "sos" as const,
        title: a.category || "Alert",
        description: a.description ?? null,
        severity: a.severity,
        status: a.status,
        ownerName: a.owner_name ?? null,
        submitterName: a.submitter_name,
        recommendedAction: a.recommended_action ?? null,
        createdAt: a.created_at,
        resolvedAt: a.resolved_at ?? null,
      })),
      ...((risks.data ?? []) as any[]).map((r) => ({
        id: r.id,
        type: "risk" as const,
        title: r.title,
        description: r.description ?? null,
        severity: r.severity,
        status: r.status,
        ownerName: r.owner_name ?? null,
        submitterName: r.owner_name ?? "—",
        recommendedAction: null,
        createdAt: r.created_at,
        resolvedAt: r.status === "Closed" ? r.updated_at : null,
      })),
    ];
    setItems(u);
  }

  useEffect(() => {
    if (!engagement) return;
    load(engagement.id);
    const ch = supabase
      .channel(`issues:${engagement.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sos_alerts", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .on("postgres_changes", { event: "*", schema: "public", table: "risks", filter: `engagement_id=eq.${engagement.id}` }, () => load(engagement.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [engagement?.id]);

  const filtered = useMemo(() => {
    return items
      .filter((i) => typeFilter === "All" || i.type === typeFilter)
      .filter((i) => sevFilter === "All" || i.severity === sevFilter)
      .filter((i) => {
        if (statusFilter === "All") return true;
        if (statusFilter === "Open") return OPEN_STATUSES.has(i.status);
        return CLOSED_STATUSES.has(i.status);
      })
      .sort((a, b) => {
        const ar = SEV_RANK[a.severity] ?? 9;
        const br = SEV_RANK[b.severity] ?? 9;
        if (ar !== br) return ar - br;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [items, typeFilter, sevFilter, statusFilter]);

  const openCount = items.filter((i) => OPEN_STATUSES.has(i.status)).length;
  const criticalCount = items.filter((i) => OPEN_STATUSES.has(i.status) && i.severity === "Critical").length;

  async function setSosStatus(i: UnifiedIssue, status: string) {
    const patch: any = { status };
    if (status === "Resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("sos_alerts").update(patch).eq("id", i.id);
    if (error) return toast.error(error.message);
    if (engagement && member && user && status === "Resolved") {
      logActivity({
        engagementId: engagement.id, userId: user.id, actorName: member.display_name,
        action: "resolved escalation", targetTable: "sos_alerts", targetId: i.id,
      });
    }
  }
  async function setRiskStatus(i: UnifiedIssue, status: string) {
    const { error } = await supabase.from("risks").update({ status, updated_at: new Date().toISOString() }).eq("id", i.id);
    if (error) return toast.error(error.message);
    if (engagement && member && user && status === "Closed") {
      logActivity({
        engagementId: engagement.id, userId: user.id, actorName: member.display_name,
        action: `closed risk "${i.title}"`, targetTable: "risks", targetId: i.id,
      });
    }
  }
  async function assignToMe(i: UnifiedIssue) {
    if (!member) return;
    const table = i.type === "sos" ? "sos_alerts" : "risks";
    const { error } = await supabase.from(table).update({ owner_name: member.display_name }).eq("id", i.id);
    if (error) return toast.error(error.message);
    toast.success(`Assigned to ${member.display_name}`);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Issues</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One board for everything that needs attention — blockers and risks ahead.
        </p>
      </div>

      <ErrorBanner error={loadError} onRetry={() => engagement && load(engagement.id)} label="Couldn't load issues." />
      {loading && items.length === 0 && <LoadingSkeleton label="Loading issues…" />}

      {criticalCount > 0 && (
        <div className="rounded-xl border border-[color:var(--red)]/40 bg-[color:color-mix(in_oklab,var(--red)_14%,transparent)] px-5 py-3 glow-red">
          <div className="flex items-center gap-3">
            <Siren className="h-5 w-5 text-[color:var(--red)]" />
            <span className="text-sm font-bold uppercase tracking-wide text-[color:var(--red)]">
              {criticalCount} critical issue{criticalCount > 1 ? "s" : ""} require attention
            </span>
          </div>
        </div>
      )}

      <Card className="border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterGroup
            label="Type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as any)}
            options={[
              { v: "All", label: `All (${items.length})` },
              { v: "sos", label: `Escalations (${items.filter((i) => i.type === "sos").length})` },
              { v: "risk", label: `Risk (${items.filter((i) => i.type === "risk").length})` },
            ]}
          />
          <FilterGroup
            label="Severity"
            value={sevFilter}
            onChange={(v) => setSevFilter(v as any)}
            options={[
              { v: "All", label: "All" },
              { v: "Critical", label: "Critical" },
              { v: "High", label: "High" },
              { v: "Medium", label: "Medium" },
              { v: "Low", label: "Low" },
            ]}
          />
          <FilterGroup
            label="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as any)}
            options={[
              { v: "Open", label: `Open (${openCount})` },
              { v: "Closed", label: "Closed" },
              { v: "All", label: "All" },
            ]}
          />
        </div>
      </Card>

      <Card className="border-border bg-surface p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
            <ShieldCheck className="mb-3 h-8 w-8 text-emerald-500" />
            All clear — no issues match these filters.
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((i) => {
              const isOpen = OPEN_STATUSES.has(i.status);
              const noOwner = !i.ownerName || !i.ownerName.trim();
              return (
                <li key={`${i.type}:${i.id}`} className="rounded-md border border-border bg-surface-hover/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {i.type === "sos" ? <Siren className="h-3 w-3 text-[color:var(--red)]" /> : <ShieldAlert className="h-3 w-3 text-[color:var(--orange)]" />}
                      {i.type === "sos" ? "Escalation" : "Risk"}
                    </span>
                    <StatusPill status={sevColor(i.severity)} label={i.severity} />
                    <span className="text-sm font-bold">{i.title}</span>
                    <StatusPill status={isOpen ? "Red" : "Green"} label={i.status} />
                    {isOpen && noOwner && (
                      <span className="inline-flex items-center rounded-full border border-[color:var(--orange)]/50 bg-[color:var(--orange)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--orange)]">
                        No Owner
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {i.submitterName} • {relativeTime(i.createdAt)}
                    </span>
                  </div>
                  {i.description && <div className="mt-2 whitespace-pre-wrap text-sm">{i.description}</div>}
                  {i.ownerName && <div className="mt-1 text-xs"><span className="text-muted-foreground">Owner:</span> {i.ownerName}</div>}
                  {i.recommendedAction && <div className="mt-1 text-xs"><span className="text-muted-foreground">Action:</span> {i.recommendedAction}</div>}

                  {isLeadership && isOpen && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {noOwner && (
                        <Button size="sm" variant="outline" onClick={() => assignToMe(i)}>
                          Assign to me
                        </Button>
                      )}
                      {i.type === "sos" ? (
                        <>
                          {i.status === "Open" && <Button size="sm" variant="outline" onClick={() => setSosStatus(i, "Acknowledged")}>Acknowledge</Button>}
                          <ConfirmAction
                            trigger={<Button size="sm">Resolve</Button>}
                            title="Resolve this escalation?"
                            description="Mark this blocker as resolved. It will stop showing in open issues."
                            confirmLabel="Resolve"
                            onConfirm={async () => { await setSosStatus(i, "Resolved"); }}
                          />
                        </>
                      ) : (
                        <>
                          {i.status !== "Mitigating" && <Button size="sm" variant="outline" onClick={() => setRiskStatus(i, "Mitigating")}>Mitigating</Button>}
                          <ConfirmAction
                            trigger={<Button size="sm">Close</Button>}
                            title="Close this risk?"
                            description="Mark this risk as closed."
                            confirmLabel="Close"
                            onConfirm={async () => { await setRiskStatus(i, "Closed"); }}
                          />
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function FilterGroup({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { v: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
              value === o.v
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
