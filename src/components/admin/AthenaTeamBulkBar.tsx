import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  bulkAssignToMission,
  bulkResendInvites,
  bulkSendAtlasInvites,
  bulkSetAtlasRole,
  getActiveMissionsForAssign,
} from "@/lib/atlas-team-actions.functions";

const ATLAS_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "engagement_lead", label: "Engagement Lead" },
  { value: "writer", label: "Writer" },
  { value: "sme", label: "SME" },
  { value: "reviewer", label: "Reviewer" },
  { value: "unassigned", label: "Unassigned" },
];

const MISSION_ROLES = ATLAS_ROLES.filter((r) => r.value !== "unassigned");

export function AthenaTeamBulkBar({
  selectedIds,
  onClear,
  onRefresh,
  isPendingTab = false,
}: {
  selectedIds: string[];
  onClear: () => void;
  onRefresh: () => void;
  isPendingTab?: boolean;
}) {
  const count = selectedIds.length;
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const sendInvites = useServerFn(bulkSendAtlasInvites);
  const resendInvites = useServerFn(bulkResendInvites);

  const inviteMut = useMutation({
    mutationFn: () =>
      isPendingTab
        ? resendInvites({ data: { memberIds: selectedIds } })
        : sendInvites({ data: { memberIds: selectedIds } }),
    onSuccess: (res: any) => {
      const skipped = res.skipped ?? 0;
      const failed = res.failed ?? 0;
      if (failed > 0) {
        toast.error(
          `Action completed with errors. ${res.sent} updated, ${failed} failed. Please retry the failed records individually.`,
        );
      } else {
        toast.success(
          skipped > 0
            ? `Invites sent to ${res.sent} people. ${skipped} skipped (already invited or active).`
            : `Invites sent to ${res.sent} people.`,
        );
      }
      setConfirmInvite(false);
      onClear();
      onRefresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send invites"),
  });

  if (count === 0) return null;

  return (
    <div className="animate-fade-in rounded-lg border border-[color:var(--athena-gold,#d4af37)]/40 bg-surface/80 px-3 py-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {count} {count === 1 ? "person" : "people"} selected
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => setConfirmInvite(true)}
            disabled={inviteMut.isPending}
          >
            Send Invites
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
            Assign to Mission
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRoleOpen(true)}>
            Set Role
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" /> Clear Selection
          </Button>
        </div>
      </div>

      {/* Send Invites confirm */}
      <AlertDialog open={confirmInvite} onOpenChange={setConfirmInvite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send ATLAS invites to {count} people?</AlertDialogTitle>
            <AlertDialogDescription>
              Members who are already invited or active will be skipped automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inviteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                inviteMut.mutate();
              }}
              disabled={inviteMut.isPending}
            >
              {inviteMut.isPending ? "Sending…" : "Send Invites"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignToMissionDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        selectedIds={selectedIds}
        onDone={() => {
          onClear();
          onRefresh();
        }}
      />

      <SetRoleDialog
        open={roleOpen}
        onOpenChange={setRoleOpen}
        selectedIds={selectedIds}
        onDone={() => {
          onClear();
          onRefresh();
        }}
      />
    </div>
  );
}

function SetRoleDialog({
  open,
  onOpenChange,
  selectedIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}) {
  const [role, setRole] = useState<string>("writer");
  const setAtlasRole = useServerFn(bulkSetAtlasRole);
  const mut = useMutation({
    mutationFn: () => setAtlasRole({ data: { memberIds: selectedIds, role: role as any } }),
    onSuccess: (res: any) => {
      const label = ATLAS_ROLES.find((r) => r.value === role)?.label ?? role;
      if (res.failed > 0) {
        toast.error(
          `Action completed with errors. ${res.updated} updated, ${res.failed} failed. Please retry the failed records individually.`,
        );
      } else {
        toast.success(`Role set to ${label} for ${res.updated} people.`);
      }
      onOpenChange(false);
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to set role"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Role for {selectedIds.length} People</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ATLAS_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-amber-400">
            This will overwrite the current role for all selected members.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving…" : "Set Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignToMissionDialog({
  open,
  onOpenChange,
  selectedIds,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedIds: string[];
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const [missionId, setMissionId] = useState<string | null>(null);
  const [role, setRole] = useState<string>("writer");

  const loadMissions = useServerFn(getActiveMissionsForAssign);
  const { data, isLoading } = useQuery({
    queryKey: ["bulk-assign-missions"],
    queryFn: () => loadMissions(),
    enabled: open,
  });

  const missions = (data as any)?.missions ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return missions;
    return missions.filter((m: any) => (m.name ?? "").toLowerCase().includes(q));
  }, [missions, query]);

  const assign = useServerFn(bulkAssignToMission);
  const mut = useMutation({
    mutationFn: () =>
      assign({
        data: { memberIds: selectedIds, missionId: missionId!, role: role as any },
      }),
    onSuccess: (res: any) => {
      const m = missions.find((x: any) => x.id === missionId);
      const name = m?.name ?? "mission";
      if (res.failed > 0 || res.skipped > 0) {
        const failed = (res.failed ?? 0) + (res.skipped ?? 0);
        toast.error(
          `Action completed with errors. ${res.assigned} updated, ${failed} failed. Please retry the failed records individually.`,
        );
      } else {
        toast.success(`${res.assigned} people assigned to ${name}.`);
      }
      onOpenChange(false);
      setMissionId(null);
      setQuery("");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to assign"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign {selectedIds.length} People to Mission</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search missions..."
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No active missions found.
              </div>
            ) : (
              filtered.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => setMissionId(m.id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-hover ${
                    missionId === m.id ? "bg-surface-hover" : ""
                  }`}
                >
                  <span>{m.name}</span>
                  {m.status && (
                    <span className="text-[10px] uppercase text-muted-foreground">{m.status}</span>
                  )}
                </button>
              ))
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Role on mission</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MISSION_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!missionId || mut.isPending}
          >
            {mut.isPending ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
