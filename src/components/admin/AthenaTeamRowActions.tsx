import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MoreHorizontal, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  sendAtlasInvite,
  setAtlasRole,
  resetMemberPassword,
  addAdminNote,
  removeMemberFromRoster,
  getActiveMissionsForAssign,
  assignMemberToMissions,
  getMemberMissionCount,
} from "@/lib/atlas-team-actions.functions";
import { PersonDetailDrawer } from "@/components/admin/PersonDetailDrawer";

export type RowMember = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  job_title: string | null;
  talentdesk_status: "approved" | "pending_onboarding" | null;
  atlas_invite_status: string;
  atlas_role: string;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  engagement_lead: "Engagement Lead",
  writer: "Writer",
  sme: "SME",
  reviewer: "Reviewer",
  unassigned: "Unassigned",
};

const ROLE_VALUES = ["admin", "engagement_lead", "writer", "sme", "reviewer", "unassigned"] as const;

function fullName(m: RowMember) {
  const n = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  return n || m.email;
}

type DialogState =
  | { kind: "none" }
  | { kind: "invite"; resend: boolean }
  | { kind: "reset" }
  | { kind: "note" }
  | { kind: "assign" }
  | { kind: "remove"; missionCount: number | null }
  | { kind: "profile" };

export function RowActions({ member }: { member: RowMember }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["atlas-team-members"] });

  const sendInviteFn = useServerFn(sendAtlasInvite);
  const setRoleFn = useServerFn(setAtlasRole);
  const removeFn = useServerFn(removeMemberFromRoster);
  const missionCountFn = useServerFn(getMemberMissionCount);

  const setRole = useMutation({
    mutationFn: (role: (typeof ROLE_VALUES)[number]) =>
      setRoleFn({ data: { memberId: member.id, role } }),
    onSuccess: (_d, role) => {
      toast.success(`Role updated to ${ROLE_LABEL[role]}.`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update role"),
  });

  const noEmail = !member.email;
  const isActive = member.atlas_invite_status === "active";
  const canResend = member.atlas_invite_status === "invite_sent" || member.atlas_invite_status === "never_logged_in";

  async function openRemove() {
    try {
      const res = (await missionCountFn({ data: { memberId: member.id } })) as { count: number };
      setDialog({ kind: "remove", missionCount: res.count });
    } catch {
      setDialog({ kind: "remove", missionCount: null });
    }
  }

  const remove = useMutation({
    mutationFn: () => removeFn({ data: { memberId: member.id } }),
    onSuccess: () => {
      toast.success(`${fullName(member)} has been removed from the roster.`);
      setDialog({ kind: "none" });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove member"),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded p-1 hover:bg-surface-hover" aria-label="Row actions">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {/* Send invite */}
          {isActive ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem disabled>Send ATLAS Invite</DropdownMenuItem>
                </div>
              </TooltipTrigger>
              <TooltipContent>Already active on ATLAS.</TooltipContent>
            </Tooltip>
          ) : noEmail ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem disabled>Send ATLAS Invite</DropdownMenuItem>
                </div>
              </TooltipTrigger>
              <TooltipContent>No email on file.</TooltipContent>
            </Tooltip>
          ) : (
            <DropdownMenuItem onClick={() => setDialog({ kind: "invite", resend: false })}>
              Send ATLAS Invite
            </DropdownMenuItem>
          )}

          {canResend && (
            <DropdownMenuItem onClick={() => setDialog({ kind: "invite", resend: true })}>
              Resend Invite
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={() => setDialog({ kind: "assign" })}>
            Assign to Mission
          </DropdownMenuItem>

          {/* Set ATLAS Role — inline submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Set ATLAS Role</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">Role</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={member.atlas_role}
                onValueChange={(v) => setRole.mutate(v as (typeof ROLE_VALUES)[number])}
              >
                {ROLE_VALUES.map((r) => (
                  <DropdownMenuRadioItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            disabled={noEmail}
            onClick={() => setDialog({ kind: "reset" })}
          >
            Reset Password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog({ kind: "profile" })}>
            View Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog({ kind: "note" })}>
            Add Note
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={openRemove}>
            Remove from Roster
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog.kind === "invite" && (
        <InviteDialog
          member={member}
          resend={dialog.resend}
          onClose={() => setDialog({ kind: "none" })}
          onDone={invalidate}
          sendInviteFn={sendInviteFn}
        />
      )}
      {dialog.kind === "reset" && (
        <ResetPasswordDialog
          member={member}
          onClose={() => setDialog({ kind: "none" })}
          onDone={invalidate}
        />
      )}
      {dialog.kind === "note" && (
        <AddNoteDialog member={member} onClose={() => setDialog({ kind: "none" })} />
      )}
      {dialog.kind === "assign" && (
        <AssignMissionsDialog member={member} onClose={() => setDialog({ kind: "none" })} />
      )}
      {dialog.kind === "remove" && (
        <AlertDialog open onOpenChange={(v) => !v && setDialog({ kind: "none" })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from roster?</AlertDialogTitle>
              <AlertDialogDescription>
                {dialog.missionCount && dialog.missionCount > 0
                  ? `Warning: ${fullName(member)} is assigned to ${dialog.missionCount} active mission${dialog.missionCount === 1 ? "" : "s"}. Removing them will not delete their mission history. Remove anyway?`
                  : `Remove ${fullName(member)} from the Athena Team roster?`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); remove.mutate(); }}
                disabled={remove.isPending}
                className="bg-red-600 text-white hover:bg-red-500"
              >
                {remove.isPending ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {dialog.kind === "profile" && (
        <ProfileDrawer member={member} onClose={() => setDialog({ kind: "none" })} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function InviteDialog({
  member, resend, onClose, onDone, sendInviteFn,
}: {
  member: RowMember;
  resend: boolean;
  onClose: () => void;
  onDone: () => void;
  sendInviteFn: ReturnType<typeof useServerFn<typeof sendAtlasInvite>>;
}) {
  const m = useMutation({
    mutationFn: () => sendInviteFn({ data: { memberId: member.id, resend } }),
    onSuccess: () => {
      toast.success(`${resend ? "Invite resent" : "Invite sent"} to ${member.email}.`);
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send invite"),
  });
  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{resend ? "Resend ATLAS invite?" : "Send ATLAS invite?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {resend
              ? `Resend the ATLAS invite email to ${fullName(member)} at ${member.email}?`
              : `Send ATLAS invite to ${fullName(member)} at ${member.email}?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); m.mutate(); }}
            disabled={m.isPending}
          >
            {m.isPending ? "Sending…" : resend ? "Resend" : "Send Invite"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ResetPasswordDialog({
  member, onClose, onDone,
}: { member: RowMember; onClose: () => void; onDone: () => void }) {
  const fn = useServerFn(resetMemberPassword);
  const m = useMutation({
    mutationFn: () => fn({ data: { memberId: member.id } }),
    onSuccess: () => {
      toast.success("Password reset email sent.");
      onDone();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send reset email"),
  });
  return (
    <AlertDialog open onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset password?</AlertDialogTitle>
          <AlertDialogDescription>
            Send a password reset email to {member.email}? This will log them out of any active sessions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); m.mutate(); }}
            disabled={m.isPending}
          >
            {m.isPending ? "Sending…" : "Send Reset Email"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function AddNoteDialog({ member, onClose }: { member: RowMember; onClose: () => void }) {
  const [body, setBody] = useState("");
  const fn = useServerFn(addAdminNote);
  const m = useMutation({
    mutationFn: () => fn({ data: { memberId: member.id, body: body.trim() } }),
    onSuccess: () => {
      toast.success("Note saved.");
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save note"),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Admin Note · {fullName(member)}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your note… (notes are append-only and cannot be edited later)"
          rows={8}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!body.trim() || m.isPending}
          >
            {m.isPending ? "Saving…" : "Save Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignMissionsDialog({ member, onClose }: { member: RowMember; onClose: () => void }) {
  const listFn = useServerFn(getActiveMissionsForAssign);
  const assignFn = useServerFn(assignMemberToMissions);
  const [filter, setFilter] = useState("");
  const [picks, setPicks] = useState<Record<string, "admin" | "engagement_lead" | "writer" | "sme" | "reviewer">>({});

  const { data, isLoading } = useQuery({
    queryKey: ["atlas-team-active-missions"],
    queryFn: () => listFn(),
  });
  const missions = (data?.missions ?? []) as Array<{ id: string; name: string }>;
  const filtered = missions.filter((m) => m.name?.toLowerCase().includes(filter.toLowerCase()));
  const selectedCount = Object.keys(picks).length;

  const submit = useMutation({
    mutationFn: () =>
      assignFn({
        data: {
          memberId: member.id,
          assignments: Object.entries(picks).map(([missionId, role]) => ({ missionId, role })),
        },
      }),
    onSuccess: (res: any) => {
      toast.success(`Assigned to ${res?.count ?? selectedCount} mission${selectedCount === 1 ? "" : "s"}.`);
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to assign"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assign to Mission · {fullName(member)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search active missions…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="max-h-[420px] overflow-auto rounded-md border border-border">
            {isLoading ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {missions.length === 0 ? "No active missions found." : "No matches."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((mi) => {
                  const role = picks[mi.id];
                  const checked = !!role;
                  return (
                    <li key={mi.id} className="flex items-center gap-3 px-3 py-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setPicks((prev) => {
                            const next = { ...prev };
                            if (v) next[mi.id] = role ?? "writer";
                            else delete next[mi.id];
                            return next;
                          });
                        }}
                      />
                      <div className="min-w-0 flex-1 truncate text-sm">{mi.name}</div>
                      <select
                        disabled={!checked}
                        value={role ?? "writer"}
                        onChange={(e) =>
                          setPicks((prev) => ({ ...prev, [mi.id]: e.target.value as any }))
                        }
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs disabled:opacity-40"
                      >
                        <option value="admin">Admin</option>
                        <option value="engagement_lead">Engagement Lead</option>
                        <option value="writer">Writer</option>
                        <option value="sme">SME</option>
                        <option value="reviewer">Reviewer</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={selectedCount === 0 || submit.isPending}
          >
            {submit.isPending ? "Assigning…" : `Assign${selectedCount ? ` (${selectedCount})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileDrawer({ member, onClose }: { member: RowMember; onClose: () => void }) {
  return (
    <PersonDetailDrawer
      memberId={member.id}
      open
      onOpenChange={(v: boolean) => !v && onClose()}
    />
  );
}


