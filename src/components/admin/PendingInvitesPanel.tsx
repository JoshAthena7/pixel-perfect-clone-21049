import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  bulkResendInvites,
  escalateOverdueInvites,
  sendAtlasInvite,
} from "@/lib/atlas-team-actions.functions";

export type PendingMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  job_title: string | null;
  talentdesk_status: "approved" | "pending_onboarding" | null;
  atlas_invite_status: string;
  atlas_invite_sent_at: string | null;
};

function fullName(m: PendingMember) {
  return (`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim()) || m.email;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

const TD_BADGE = (s: PendingMember["talentdesk_status"]) =>
  s === "approved"
    ? { label: "Approved", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" }
    : s === "pending_onboarding"
      ? { label: "Pending Onboarding", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" }
      : { label: "—", cls: "bg-zinc-700/40 text-zinc-300 border-zinc-600/60" };

const ATLAS_BADGE: Record<string, { label: string; cls: string }> = {
  invite_sent: { label: "Invite Sent", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  never_logged_in: { label: "Never Logged In", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
};

export function PendingInvitesPanel({
  members,
  selected,
  onToggleOne,
  onToggleAll,
  onOpenDetail,
}: {
  members: PendingMember[];
  selected: Set<string>;
  onToggleOne: (id: string, v: boolean) => void;
  onToggleAll: (checked: boolean, visible: PendingMember[]) => void;
  onOpenDetail: (id: string) => void;
}) {
  const qc = useQueryClient();
  const escalate = useServerFn(escalateOverdueInvites);
  const resendOne = useServerFn(sendAtlasInvite);
  const resendBulk = useServerFn(bulkResendInvites);

  // Auto-escalation: silent background pass when panel mounts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await escalate();
        if (!cancelled && (res?.escalated ?? 0) > 0) {
          qc.invalidateQueries({ queryKey: ["atlas-team-members"] });
        }
      } catch {
        // silent — must not block page render
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [escalate, qc]);

  const [confirmResend, setConfirmResend] = useState<PendingMember | null>(null);
  const [confirmResendAll, setConfirmResendAll] = useState(false);

  const overdue = useMemo(
    () =>
      members.filter((m) => {
        const d = daysSince(m.atlas_invite_sent_at);
        return d !== null && d > 14;
      }),
    [members],
  );
  const waiting = members.length - overdue.length;

  const resendOneMut = useMutation({
    mutationFn: (m: PendingMember) =>
      resendOne({ data: { memberId: m.id, resend: true } }),
    onSuccess: (_res, m) => {
      toast.success(`Invite resent to ${m.email}.`);
      qc.invalidateQueries({ queryKey: ["atlas-team-members"] });
      setConfirmResend(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to resend invite"),
  });

  const resendAllMut = useMutation({
    mutationFn: () => resendBulk({ data: { memberIds: overdue.map((m) => m.id) } }),
    onSuccess: (res: any) => {
      const sent = res?.sent ?? 0;
      const failed = res?.failed ?? 0;
      if (failed > 0) {
        toast.error(
          `Action completed with errors. ${sent} updated, ${failed} failed. Please retry the failed records individually.`,
        );
      } else {
        toast.success(`Invites resent to ${sent} ${sent === 1 ? "person" : "people"}.`);
      }
      qc.invalidateQueries({ queryKey: ["atlas-team-members"] });
      setConfirmResendAll(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to resend invites"),
  });

  const visibleSelected = members.reduce((n, m) => (selected.has(m.id) ? n + 1 : n), 0);
  const headerCheckState: boolean | "indeterminate" =
    members.length > 0 && visibleSelected === members.length
      ? true
      : visibleSelected > 0
        ? "indeterminate"
        : false;

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface/40 px-4 py-12 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-400" />
        <p className="text-sm text-muted-foreground">
          Everyone has accepted their invite. No pending invites.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface/60 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-amber-300">
            <span className="font-semibold">{waiting}</span> invites sent and waiting
          </span>
          <span className="text-red-400">
            <span className="font-semibold">{overdue.length}</span> invites sent 14+ days ago with no
            login
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={overdue.length === 0 || resendAllMut.isPending}
          onClick={() => setConfirmResendAll(true)}
        >
          Resend All Overdue
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface/40">
        <table className="w-full text-sm">
          <thead className="bg-surface/70 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <Checkbox
                  checked={headerCheckState}
                  onCheckedChange={(v) => onToggleAll(Boolean(v), members)}
                  aria-label="Select all visible"
                />
              </th>
              <th className="px-3 py-2.5 text-left font-medium">Name</th>
              <th className="px-3 py-2.5 text-left font-medium">Email</th>
              <th className="px-3 py-2.5 text-left font-medium">TD Status</th>
              <th className="px-3 py-2.5 text-left font-medium">Invite Sent</th>
              <th className="px-3 py-2.5 text-left font-medium">Days Since Invite</th>
              <th className="px-3 py-2.5 text-left font-medium">ATLAS Status</th>
              <th className="px-3 py-2.5 text-right font-medium">Resend Invite</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const td = TD_BADGE(m.talentdesk_status);
              const atlas =
                ATLAS_BADGE[m.atlas_invite_status] ?? {
                  label: m.atlas_invite_status,
                  cls: "bg-zinc-700/40 text-zinc-200 border-zinc-600/60",
                };
              const d = daysSince(m.atlas_invite_sent_at);
              const overdueRow = d !== null && d > 14;
              const noEmail = !m.email;

              return (
                <tr
                  key={m.id}
                  className={`border-t border-border/60 ${i % 2 ? "bg-surface/30" : "bg-transparent"} hover:bg-surface-hover/60`}
                >
                  <td className="px-3 py-2.5">
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={(v) => onToggleOne(m.id, Boolean(v))}
                      aria-label={`Select ${fullName(m)}`}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(m.id)}
                      className="text-left font-medium text-foreground hover:text-[color:var(--athena-gold)]"
                    >
                      {fullName(m)}
                    </button>
                    {m.job_title && (
                      <div className="text-[11px] text-muted-foreground">{m.job_title}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{m.email || "—"}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${td.cls}`}
                    >
                      TD · {td.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{formatLongDate(m.atlas_invite_sent_at)}</td>
                  <td className="px-3 py-2.5">
                    {d === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className={overdueRow ? "font-bold text-red-400" : ""}>
                        {d} day{d === 1 ? "" : "s"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${atlas.cls}`}
                    >
                      ATLAS · {atlas.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {noEmail ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button size="sm" variant="outline" disabled>
                              Resend
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>No email on file.</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmResend(m)}
                        disabled={resendOneMut.isPending}
                      >
                        Resend
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Single resend confirm */}
      <AlertDialog open={!!confirmResend} onOpenChange={(v) => !v && setConfirmResend(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Resend ATLAS invite to {confirmResend?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will receive a fresh invitation email and the invite age will reset to 0 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resendOneMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmResend) resendOneMut.mutate(confirmResend);
              }}
              disabled={resendOneMut.isPending}
            >
              {resendOneMut.isPending ? "Resending…" : "Resend Invite"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resend all overdue confirm */}
      <AlertDialog open={confirmResendAll} onOpenChange={setConfirmResendAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Resend invites to all {overdue.length} overdue members?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Members without an email on file will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resendAllMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                resendAllMut.mutate();
              }}
              disabled={resendAllMut.isPending}
            >
              {resendAllMut.isPending ? "Resending…" : "Resend All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
