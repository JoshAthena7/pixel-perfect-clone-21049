/**
 * Mission Brief Artifact — primary IRIS-generated brief surfaced at the
 * top of the Briefing Room with approval workflow (Draft / In Review /
 * Approved). Admins or engagement leads can approve / un-approve.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  getMissionBriefStatus, setMissionBriefStatus, type BriefStatus,
} from "@/lib/mission-brief-approval.functions";
import { getMissionCustomerIntelligence } from "@/lib/iris-enrich-mission-brief.functions";
import { IrisIntelligenceBrief } from "@/components/iris/IrisIntelligenceBrief";

const GOLD = "#C9A55C";

const STATUS_META: Record<BriefStatus, { label: string; bg: string; fg: string; border: string }> = {
  draft:     { label: "Draft",     bg: "rgba(255,255,255,0.06)", fg: "rgba(255,255,255,0.7)", border: "rgba(255,255,255,0.12)" },
  in_review: { label: "In Review", bg: "rgba(201,165,92,0.12)",  fg: GOLD,                    border: "rgba(201,165,92,0.4)" },
  approved:  { label: "Approved",  bg: "rgba(34,197,94,0.12)",   fg: "rgb(74,222,128)",       border: "rgba(34,197,94,0.4)" },
};

export function MissionBriefArtifact({ missionId }: { missionId: string }) {
  const statusFn = useServerFn(getMissionBriefStatus);
  const mutateFn = useServerFn(setMissionBriefStatus);
  const qc = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["mission-brief-status", missionId],
    queryFn: () => statusFn({ data: { missionId } }),
    staleTime: 30_000,
  });

  const [confirmAction, setConfirmAction] = useState<null | "approve" | "unapprove">(null);

  const mutation = useMutation({
    mutationFn: (action: "approve" | "unapprove") => mutateFn({ data: { missionId, action } }),
    onSuccess: (_d, action) => {
      qc.invalidateQueries({ queryKey: ["mission-brief-status", missionId] });
      toast.success(action === "approve" ? "Mission Brief approved." : "Mission Brief returned to draft.");
      setConfirmAction(null);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not update brief status.");
      setConfirmAction(null);
    },
  });

  const meta = STATUS_META[status?.brief_status ?? "draft"];
  const isApproved = status?.brief_status === "approved";

  return (
    <section
      className="rounded-xl border p-5 md:p-6 mb-6"
      style={{
        borderColor: isApproved ? "rgba(34,197,94,0.35)" : "rgba(201,165,92,0.3)",
        background: "linear-gradient(180deg, rgba(201,165,92,0.05), rgba(0,0,0,0))",
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5" style={{ color: GOLD }} />
          <h2 className="text-lg md:text-xl font-medium tracking-tight">Mission Brief</h2>
          <Badge
            variant="outline"
            style={{ background: meta.bg, color: meta.fg, borderColor: meta.border }}
            className="text-[11px]"
          >
            {isApproved && <CheckCircle2 className="h-3 w-3 mr-1 inline" />}
            {meta.label}
          </Badge>
          {status?.brief_version ? (
            <span className="text-[11px] text-muted-foreground">
              v{status.brief_version}
            </span>
          ) : null}
        </div>

        {status?.canApprove ? (
          isApproved ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmAction("unapprove")}
              disabled={mutation.isPending}
            >
              Un-approve
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setConfirmAction("approve")}
              disabled={mutation.isPending}
              style={{ background: GOLD, color: "#111" }}
            >
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Approve Mission Brief
            </Button>
          )
        ) : null}
      </header>

      {isApproved && status?.brief_approved_at ? (
        <p className="text-[12px] text-muted-foreground mb-3">
          Approved {new Date(status.brief_approved_at).toLocaleString()}
          {status.approver_name ? ` by ${status.approver_name}` : ""}. Canvas fields are read-only.
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground mb-3">
          IRIS synthesizes this brief from the mission canvas, intelligence graph, and expert inputs. Supporting materials below.
        </p>
      )}

      <IrisIntelligenceBrief missionId={missionId} contextType="flight_deck" />

      <IntelligenceSourcesFooter missionId={missionId} />



      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "approve" ? "Approve this Mission Brief?" : "Return brief to draft?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "approve"
                ? "Approving this brief makes it the team's source of truth. Canvas fields will become read-only. Continue?"
                : "The brief will move back to Draft and canvas fields become editable in Olympus again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && mutation.mutate(confirmAction)}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Working…" : confirmAction === "approve" ? "Approve" : "Un-approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function IntelligenceSourcesFooter({ missionId }: { missionId: string }) {
  const fn = useServerFn(getMissionCustomerIntelligence);
  const { data, isLoading } = useQuery({
    queryKey: ["mission-customer-intel", missionId],
    queryFn: () => fn({ data: { mission_id: missionId } }),
    staleTime: 60_000,
  });

  if (isLoading || !data) return null;

  const expertCount = data.experts.length;
  const stakeholderCount = data.stakeholders.length;
  const executiveCount = data.executives.length;
  const signalCount = data.signals.length;
  const insightCount = data.insights.length;
  const total = expertCount + stakeholderCount + executiveCount + signalCount + insightCount;

  return (
    <details className="mt-4 group">
      <summary className="cursor-pointer text-[12px] text-muted-foreground hover:text-foreground">
        Intelligence Sources Used
        {total > 0 ? (
          <span className="ml-2 normal-case tracking-normal text-[12px] text-muted-foreground">
            ({total} record{total === 1 ? "" : "s"})
          </span>
        ) : null}
      </summary>
      <div className="mt-2 text-[12px] text-muted-foreground space-y-1">
        {total === 0 ? (
          <p>No stakeholder, executive, or expert intelligence captured yet for this mission.</p>
        ) : (
          <p>
            Based on{" "}
            <span className="text-foreground">{expertCount}</span> expert profile{expertCount === 1 ? "" : "s"},{" "}
            <span className="text-foreground">{stakeholderCount}</span> stakeholder record{stakeholderCount === 1 ? "" : "s"},{" "}
            <span className="text-foreground">{executiveCount}</span> executive record{executiveCount === 1 ? "" : "s"},{" "}
            <span className="text-foreground">{signalCount}</span> IRIS signal{signalCount === 1 ? "" : "s"}, and{" "}
            <span className="text-foreground">{insightCount}</span> stakeholder insight{insightCount === 1 ? "" : "s"}.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/70">
          Refreshed {new Date(data.freshness.generated_at).toLocaleTimeString()}.
        </p>
      </div>
    </details>
  );
}
