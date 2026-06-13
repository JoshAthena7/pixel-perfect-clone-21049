import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Plus, Trash2, X, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/mission-helpers";

const MISSION_ROLES = [
  { value: "engagement_lead", label: "Engagement Lead", color: "bg-primary/20 text-primary border-primary/40" },
  { value: "writer", label: "Writer", color: "bg-blue-900/20 text-blue-300 border-blue-500/40" },
  { value: "sme", label: "SME", color: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
  { value: "reviewer", label: "Reviewer", color: "bg-slate-500/15 text-slate-500 border-slate-500/30" },
];

const ACCEPT_COLOR: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  accepted: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  need_help: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  capacity_concern: "bg-red-500/15 text-red-500 border-red-500/30",
};

const CONF_COLOR: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  low: "bg-red-500/15 text-red-500 border-red-500/30",
  not_set: "bg-muted text-muted-foreground",
};

export function TeamAssignmentsTab({
  missionId,
  missionName,
  initialSub = "team",
}: {
  missionId: string;
  missionName: string;
  initialSub?: "team" | "assignments";
}) {
  const [sub, setSub] = useState<"team" | "assignments">(initialSub);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Team & Assignments</h2>
      </div>
      <div className="flex gap-1 border-b border-border">
        <button onClick={() => setSub("team")}
                className={`px-3 py-2 text-sm border-b-2 ${sub === "team" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
          Team
        </button>
        <button onClick={() => setSub("assignments")}
                className={`px-3 py-2 text-sm border-b-2 ${sub === "assignments" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
          Assignments
        </button>
      </div>
      {sub === "team"
        ? <TeamSub missionId={missionId} />
        : <AssignmentsSub missionId={missionId} missionName={missionName} />}
    </div>
  );
}

function TeamSub({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<any>(null);
  const [blockOpen, setBlockOpen] = useState<{ count: number } | null>(null);

  const { data: members, isLoading, isError, refetch } = useQuery({
    queryKey: ["mt-team", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("id, member_id, mission_role, added_at, atlas_team_members(id, first_name, last_name, job_title, avatar_url, atlas_invite_status, atlas_last_active_at)")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const { data: assignmentCounts } = useQuery({
    queryKey: ["mt-assignment-counts", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_assignments")
        .select("assigned_writer_id")
        .eq("mission_id", missionId);
      const map = new Map<string, number>();
      (data ?? []).forEach((a) => {
        if (a.assigned_writer_id) map.set(a.assigned_writer_id, (map.get(a.assigned_writer_id) ?? 0) + 1);
      });
      return map;
    },
  });

  const updateRole = async (id: string, role: string) => {
    const { error } = await supabase.from("mission_team_members").update({ mission_role: role }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["mt-team", missionId] });
  };

  const tryRemove = async (m: any) => {
    const memberId = m.member_id;
    const { count } = await supabase
      .from("mission_assignments")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .eq("assigned_writer_id", memberId);
    if ((count ?? 0) > 0) {
      setBlockOpen({ count: count ?? 0 });
      return;
    }
    setRemoveTarget(m);
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const { error } = await supabase.from("mission_team_members").delete().eq("id", removeTarget.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Team member removed", metadata: { member_id: removeTarget.member_id } });
    toast.success("Removed from mission.");
    setRemoveTarget(null);
    qc.invalidateQueries({ queryKey: ["mt-team", missionId] });
  };

  const sendInvite = async (memberId: string) => {
    const { error } = await supabase
      .from("atlas_team_members")
      .update({ atlas_invite_status: "invited", atlas_invite_sent_at: new Date().toISOString() })
      .eq("id", memberId);
    if (error) { toast.error(error.message); return; }
    toast.success("Invite sent.");
    qc.invalidateQueries({ queryKey: ["mt-team", missionId] });
  };

  if (isError) return <ErrorState message="Couldn't load mission team." onRetry={() => refetch()} />;
  if (isLoading) return <SkeletonRows rows={5} height="h-14" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Mission Team <span className="text-muted-foreground font-normal">({members?.length ?? 0})</span></h3>
        <Button variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="size-4 mr-1" />Add Team Member
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Member</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">ATLAS</th>
              <th className="px-3 py-2 text-left">Assignments</th>
              <th className="px-3 py-2 text-left">Last Active</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m: any) => {
              const a = m.atlas_team_members;
              if (!a) return null;
              const roleMeta = MISSION_ROLES.find((r) => r.value === m.mission_role);
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">
                        {(a.first_name ?? "?").charAt(0)}{(a.last_name ?? "").charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium">{a.first_name} {a.last_name}</div>
                        <div className="text-xs text-muted-foreground">{a.job_title}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Select value={m.mission_role} onValueChange={(v) => updateRole(m.id, v)}>
                      <SelectTrigger className="h-8 w-40 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MISSION_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {roleMeta && (
                      <Badge variant="outline" className={cn("mt-1", roleMeta.color)}>{roleMeta.label}</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 capitalize text-xs">{a.atlas_invite_status ?? "—"}</td>
                  <td className="px-3 py-2 text-center">{assignmentCounts?.get(m.member_id) ?? 0}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {a.atlas_last_active_at ? formatDistanceToNowStrict(new Date(a.atlas_last_active_at), { addSuffix: true }) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      {a.atlas_invite_status !== "active" && (
                        <Button size="sm" variant="ghost" onClick={() => sendInvite(m.member_id)}>Invite</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => tryRemove(m)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddMemberSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        missionId={missionId}
        existingIds={new Set((members ?? []).map((m: any) => m.member_id))}
        onAdded={() => qc.invalidateQueries({ queryKey: ["mt-team", missionId] })}
      />

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from mission?</AlertDialogTitle>
            <AlertDialogDescription>This person will lose access to this mission.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!blockOpen} onOpenChange={(o) => !o && setBlockOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot remove</AlertDialogTitle>
            <AlertDialogDescription>
              This person is assigned to {blockOpen?.count} active question{blockOpen?.count === 1 ? "" : "s"}. You must reassign their questions before removing them from the mission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockOpen(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddMemberSheet({
  open, onOpenChange, missionId, existingIds, onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  missionId: string;
  existingIds: Set<string>;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [role, setRole] = useState("writer");

  const { data: available } = useQuery({
    queryKey: ["available-team", open],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("atlas_team_members")
        .select("id, first_name, last_name, job_title, atlas_invite_status")
        .eq("is_removed", false)
        .order("first_name");
      return data ?? [];
    },
  });

  const filtered = (available ?? []).filter(
    (m) => !existingIds.has(m.id) &&
      `${m.first_name ?? ""} ${m.last_name ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  const add = async () => {
    if (!pending) return;
    const { error } = await supabase.from("mission_team_members").insert({
      mission_id: missionId,
      member_id: pending,
      mission_role: role,
    });
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Team member added", metadata: { member_id: pending, role } });
    toast.success("Added to mission.");
    setPending(null); setRole("writer"); setSearch("");
    onOpenChange(false);
    onAdded();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader><SheetTitle>Add Team Member</SheetTitle></SheetHeader>
        <div className="py-4 space-y-3">
          <Input placeholder="Search by name" value={search} onChange={(e) => setSearch(e.target.value)} />
          {pending ? (
            <div className="space-y-3">
              <div className="rounded p-3 bg-muted">
                Selected: {available?.find((m) => m.id === pending)?.first_name} {available?.find((m) => m.id === pending)?.last_name}
              </div>
              <div>
                <label className="text-sm">Mission role</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MISSION_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
                <Button onClick={add}>Confirm</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPending(m.id)}
                  className="block w-full text-left p-2 rounded hover:bg-muted"
                >
                  <div className="font-medium">{m.first_name} {m.last_name}</div>
                  <div className="text-xs text-muted-foreground">{m.job_title}</div>
                </button>
              ))}
              {!filtered.length && <p className="text-sm text-muted-foreground">No matches.</p>}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function truncate(s: string | null | undefined, n = 80) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function deriveAssignmentStatus(a: any): { label: string; cls: string } {
  const qStatus = (a?.mission_questions?.status ?? "").toLowerCase();
  if (qStatus === "complete" || qStatus === "completed")
    return { label: "Complete", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" };
  if (!a?.assigned_writer_id)
    return { label: "Unassigned", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
  if (a?.acceptance_status === "accepted")
    return { label: "In Progress", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" };
  return { label: "Assigned", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" };
}

function AssignmentsSub({ missionId, missionName }: { missionId: string; missionName: string }) {
  const qc = useQueryClient();
  const [writerFilter, setWriterFilter] = useState("all");
  const [acceptFilter, setAcceptFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState<"writer" | "due" | null>(null);
  const [bulkWriter, setBulkWriter] = useState<string | null>(null);
  const [bulkDate, setBulkDate] = useState<Date | undefined>();

  const { data: canManage = false } = useQuery({
    queryKey: ["mt-can-manage", missionId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) return false;
      const { data } = await supabase.rpc("can_manage_mission_assignments", {
        _mission_id: missionId,
        _user_id: u.user.id,
      });
      return Boolean(data);
    },
  });

  const { data: assignments, isLoading: assignmentsLoading, isError: assignmentsError, refetch: refetchAssignments } = useQuery({
    queryKey: ["mt-assignments", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_assignments")
        .select(`
          id, question_id, assigned_writer_id, sme_member_ids, acceptance_status, writer_confidence,
          due_date, assigned_at
        `)
        .eq("mission_id", missionId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: questions, isLoading: questionsLoading, isError: questionsError, refetch: refetchQuestions } = useQuery({
    queryKey: ["mt-assignment-questions", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_questions")
        .select("id, question_number, question_text, status, section_id, mission_sections(name, section_number)")
        .eq("mission_id", missionId)
        .order("question_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: team } = useQuery({
    queryKey: ["mt-team-min", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("member_id, atlas_team_members(first_name, last_name)")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const teamName = (id: string | null) => {
    if (!id) return "Unassigned";
    const m = team?.find((x: any) => x.member_id === id);
    if (!m?.atlas_team_members) return "—";
    return `${m.atlas_team_members.first_name} ${m.atlas_team_members.last_name}`;
  };

  const rows = useMemo(() => {
    const assignmentByQuestion = new Map((assignments ?? []).map((a: any) => [a.question_id, a]));
    return (questions ?? []).map((q: any) => {
      const assignment = assignmentByQuestion.get(q.id) as any;
      return {
        ...(assignment ?? {
          id: null,
          question_id: q.id,
          assigned_writer_id: null,
          sme_member_ids: [],
          acceptance_status: "pending",
          writer_confidence: "not_set",
          due_date: null,
          assigned_at: null,
        }),
        mission_questions: q,
      };
    });
  }, [assignments, questions]);

  const filtered = useMemo(() => {
    return rows.filter((a: any) => {
      if (writerFilter !== "all" && a.assigned_writer_id !== writerFilter) return false;
      if (acceptFilter !== "all" && a.acceptance_status !== acceptFilter) return false;
      return true;
    });
  }, [rows, writerFilter, acceptFilter]);

  const totalCount = rows.length;
  const assignedCount = rows.filter((a: any) => a.assigned_writer_id).length;

  const reassign = async (assignmentId: string | null, questionId: string, oldWriterId: string | null, newWriterId: string) => {
    if (!canManage) { toast.error("Only mission admins can change assignments."); return; }
    const patch = {
        assigned_writer_id: newWriterId,
        acceptance_status: "pending",
        writer_confidence: "not_set",
        assigned_at: new Date().toISOString(),
    };
    const { data: u } = await supabase.auth.getUser();
    const result = await supabase.from("mission_assignments").upsert({
      id: assignmentId ?? undefined,
      mission_id: missionId,
      question_id: questionId,
      ...patch,
      assigned_by: u.user?.id,
    }, { onConflict: "mission_id,question_id" }).select("id").single();
    const { data: saved, error } = result;
    if (error) { toast.error(error.message); return; }
    const notifs: any[] = [{
      recipient_id: newWriterId,
      recipient_role: "specific_user",
      type: "assignment_acceptance_required",
      message: `You have been assigned a question on ${missionName}.`,
      metadata: { mission_id: missionId, assignment_id: saved?.id ?? assignmentId },
    }];
    if (oldWriterId) {
      notifs.push({
        recipient_id: oldWriterId,
        recipient_role: "specific_user",
        type: "assignment_removed",
        message: `Your assignment on ${missionName} has been reassigned.`,
        metadata: { mission_id: missionId, assignment_id: saved?.id ?? assignmentId },
      });
    }
    await supabase.from("atlas_notifications").insert(notifs);
    await logAudit({ missionId, action: "Assignment reassigned", metadata: { assignment_id: saved?.id ?? assignmentId, question_id: questionId, from: oldWriterId, to: newWriterId } });
    qc.invalidateQueries({ queryKey: ["mt-assignments", missionId] });
  };

  const updateDue = async (id: string | null, questionId: string, d: Date | undefined) => {
    if (!canManage) { toast.error("Only mission admins can change assignments."); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("mission_assignments").upsert({
      id: id ?? undefined,
      mission_id: missionId,
      question_id: questionId,
      due_date: d ? d.toISOString() : null,
      assigned_by: u.user?.id,
    }, { onConflict: "mission_id,question_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["mt-assignments", missionId] });
  };

  const updateSmes = async (id: string | null, questionId: string, ids: string[]) => {
    if (!canManage) { toast.error("Only mission admins can change assignments."); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("mission_assignments").upsert({
      id: id ?? undefined,
      mission_id: missionId,
      question_id: questionId,
      sme_member_ids: ids,
      assigned_by: u.user?.id,
    }, { onConflict: "mission_id,question_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["mt-assignments", missionId] });
  };

  const bulkReassign = async () => {
    if (!bulkWriter || selected.size === 0) return;
    for (const questionId of selected) {
      const a: any = rows.find((x: any) => x.question_id === questionId);
      if (a) await reassign(a.id, a.question_id, a.assigned_writer_id, bulkWriter);
    }
    setSelected(new Set()); setBulkOpen(null); setBulkWriter(null);
    toast.success("Bulk reassignment complete.");
  };

  const bulkSetDue = async () => {
    if (!bulkDate || selected.size === 0) return;
    await Promise.all(
      Array.from(selected).map((questionId) => {
        const a: any = rows.find((x: any) => x.question_id === questionId);
        return a ? updateDue(a.id, a.question_id, bulkDate) : Promise.resolve();
      }
      ),
    );
    setSelected(new Set()); setBulkOpen(null); setBulkDate(undefined);
    qc.invalidateQueries({ queryKey: ["mt-assignments", missionId] });
    toast.success("Due dates updated.");
  };

  if (assignmentsError || questionsError) return <ErrorState message="Couldn't load assignments." onRetry={() => { refetchAssignments(); refetchQuestions(); }} />;
  if (assignmentsLoading || questionsLoading) return <SkeletonRows rows={5} height="h-14" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">
            Question Assignments
            <span className="text-muted-foreground font-normal"> ({assignedCount} of {totalCount} assigned)</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Olympus is the single source of truth for question assignments. Flight Deck and Threads show this read-only.
            {!canManage && " Assignments are managed in Olympus by mission admins."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={writerFilter} onValueChange={setWriterFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Writer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Writers</SelectItem>
            {(team ?? []).map((m: any) => (
              <SelectItem key={m.member_id} value={m.member_id}>{teamName(m.member_id)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={acceptFilter} onValueChange={setAcceptFilter}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Acceptance</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="need_help">Need Help</SelectItem>
            <SelectItem value="capacity_concern">Capacity Concern</SelectItem>
          </SelectContent>
        </Select>
        {canManage && selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span>{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => setBulkOpen("writer")}>Bulk Reassign</Button>
            <Button size="sm" variant="outline" onClick={() => setBulkOpen("due")}>Bulk Due Date</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              {canManage && <th className="px-2 py-2"></th>}
              <th className="px-2 py-2 text-left">Q#</th>
              <th className="px-2 py-2 text-left">Section</th>
              <th className="px-2 py-2 text-left">Question</th>
              <th className="px-2 py-2 text-left">Lead Writer</th>
              <th className="px-2 py-2 text-left">SMEs</th>
              <th className="px-2 py-2 text-left">Due</th>
              <th className="px-2 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a: any) => {
              const q = a.mission_questions;
              const status = deriveAssignmentStatus(a);
              const smeIds: string[] = Array.isArray(a.sme_member_ids) ? a.sme_member_ids : [];
              return (
                <tr key={a.question_id} className="border-t">
                  {canManage && (
                    <td className="px-2 py-2">
                      <Checkbox
                        checked={selected.has(a.question_id)}
                        onCheckedChange={(v) => {
                          const n = new Set(selected);
                          v ? n.add(a.question_id) : n.delete(a.question_id);
                          setSelected(n);
                        }}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2 text-primary font-medium">{q?.question_number ?? "—"}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">
                    {q?.mission_sections?.section_number} {q?.mission_sections?.name}
                  </td>
                  <td className="px-2 py-2 max-w-xs">{truncate(q?.question_text, 80)}</td>
                  <td className="px-2 py-2">
                    {canManage ? (
                      <Select
                        value={a.assigned_writer_id ?? "none"}
                        onValueChange={(v) => reassign(a.id, a.question_id, a.assigned_writer_id, v)}
                      >
                        <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                        <SelectContent>
                          {(team ?? []).map((m: any) => (
                            <SelectItem key={m.member_id} value={m.member_id}>{teamName(m.member_id)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      a.assigned_writer_id
                        ? <span className="text-xs">{teamName(a.assigned_writer_id)}</span>
                        : <Badge variant="outline" className="bg-amber-500/15 text-amber-500 border-amber-500/30">Unassigned</Badge>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canManage ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 text-xs w-40 justify-start">
                            {smeIds.length === 0 ? "Add SMEs" : `${smeIds.length} SME${smeIds.length === 1 ? "" : "s"}`}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2 pointer-events-auto" align="start">
                          <div className="max-h-64 overflow-y-auto space-y-1">
                            {(team ?? []).length === 0 && (
                              <div className="text-xs text-muted-foreground p-2">No team members.</div>
                            )}
                            {(team ?? []).map((m: any) => {
                              const checked = smeIds.includes(m.member_id);
                              return (
                                <label key={m.member_id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer text-sm">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(v) => {
                                      const next = v
                                        ? Array.from(new Set([...smeIds, m.member_id]))
                                        : smeIds.filter((x) => x !== m.member_id);
                                      updateSmes(a.id, a.question_id, next);
                                    }}
                                  />
                                  <span>{teamName(m.member_id)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {smeIds.length === 0
                          ? <span className="text-xs text-muted-foreground">—</span>
                          : smeIds.map((id) => (
                              <Badge key={id} variant="outline" className="text-xs">{teamName(id)}</Badge>
                            ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {canManage ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 text-xs">
                            <CalendarIcon className="size-3 mr-1" />
                            {a.due_date ? format(new Date(a.due_date), "MMM d") : "—"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={a.due_date ? new Date(a.due_date) : undefined}
                                    onSelect={(d) => updateDue(a.id, a.question_id, d)} className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <span className="text-xs">{a.due_date ? format(new Date(a.due_date), "MMM d") : "—"}</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Badge variant="outline" className={status.cls}>{status.label}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={bulkOpen === "writer"} onOpenChange={(o) => !o && setBulkOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Reassign Writer</AlertDialogTitle>
          </AlertDialogHeader>
          <Select value={bulkWriter ?? ""} onValueChange={setBulkWriter}>
            <SelectTrigger><SelectValue placeholder="Pick writer" /></SelectTrigger>
            <SelectContent>
              {(team ?? []).map((m: any) => (
                <SelectItem key={m.member_id} value={m.member_id}>{teamName(m.member_id)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkReassign}>Reassign {selected.size}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkOpen === "due"} onOpenChange={(o) => !o && setBulkOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Change Due Date</AlertDialogTitle>
          </AlertDialogHeader>
          <Calendar mode="single" selected={bulkDate} onSelect={setBulkDate} className="pointer-events-auto" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkSetDue}>Apply to {selected.size}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
