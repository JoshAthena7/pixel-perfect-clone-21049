import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, MoreVertical, Pencil, Trash2, GripVertical, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { logAudit } from "@/lib/mission-helpers";

type Item = {
  id: string;
  mission_id: string;
  label: string;
  description: string | null;
  owner_id: string | null;
  due_date: string | null;
  status: string;
  is_complete: boolean;
  iris_extracted: boolean;
  order_index: number | null;
};

const STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "verified", label: "Verified" },
];

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  complete: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  verified: "bg-emerald-600/20 text-emerald-600 border-emerald-600/30",
};

export function SubmissionChecklistTab({
  missionId, deadline,
}: {
  missionId: string; deadline: string | null;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data: items, isLoading, isError, refetch } = useQuery({
    queryKey: ["submission-checklist", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_submission_checklist")
        .select("*")
        .eq("mission_id", missionId)
        .order("order_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const { data: team } = useQuery({
    queryKey: ["mission-team-min", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_team_members")
        .select("member_id, atlas_team_members(first_name, last_name)")
        .eq("mission_id", missionId);
      return (data ?? []) as Array<{
        member_id: string;
        atlas_team_members: { first_name: string | null; last_name: string | null } | null;
      }>;
    },
  });

  const memberName = (id: string | null) => {
    if (!id) return null;
    const m = team?.find((x) => x.member_id === id);
    if (!m?.atlas_team_members) return null;
    return `${m.atlas_team_members.first_name ?? ""} ${m.atlas_team_members.last_name ?? ""}`.trim();
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: items?.length ?? 0, not_started: 0, in_progress: 0, complete: 0, verified: 0,
    };
    (items ?? []).forEach((i) => { c[i.status] = (c[i.status] ?? 0) + 1; });
    return c;
  }, [items]);

  const filtered = (items ?? []).filter((i) => filter === "all" || i.status === filter);

  const total = items?.length ?? 0;
  const done = (counts.complete ?? 0) + (counts.verified ?? 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";

  const days = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
    : null;
  const notStartedCount = counts.not_started ?? 0;
  const showWarning = days !== null && days <= 14 && notStartedCount > 0;

  const isOverdue = (i: Item) =>
    !!i.due_date && new Date(i.due_date) < new Date() &&
    i.status !== "complete" && i.status !== "verified";

  const update = async (id: string, patch: Partial<Item>) => {
    if ("status" in patch) {
      patch.is_complete = patch.status === "complete" || patch.status === "verified";
    }
    const { error } = await supabase.from("mission_submission_checklist").update(patch as any).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["submission-checklist", missionId] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("mission_submission_checklist").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["submission-checklist", missionId] });
  };

  const onDrop = async (overId: string) => {
    if (!dragId || !items || dragId === overId) return;
    const arr = [...items];
    const from = arr.findIndex((i) => i.id === dragId);
    const to = arr.findIndex((i) => i.id === overId);
    if (from < 0 || to < 0) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setDragId(null);
    await Promise.all(
      arr.map((it, idx) =>
        supabase.from("mission_submission_checklist").update({ order_index: idx }).eq("id", it.id),
      ),
    );
    qc.invalidateQueries({ queryKey: ["submission-checklist", missionId] });
  };

  if (isError) return <ErrorState message="Couldn't load the submission checklist." onRetry={() => refetch()} />;
  if (isLoading) return <SkeletonRows rows={5} height="h-20" />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-end gap-4">
        <Button variant="outline" className="border-primary text-primary hover:bg-primary/10"
                onClick={() => setAddOpen(true)}>
          <Plus className="size-4 mr-2" />Add Item
        </Button>
      </div>


      <div className="rounded-lg border bg-muted/30 p-3 text-[14px] text-muted-foreground">
        Submission requirements are separate from content requirements. These are the physical and administrative items the client requires in the submission package.
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[14px]">
          <span>{done} of {total} items complete</span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div className="h-2 w-full bg-muted rounded overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {showWarning && (
        <div className="rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 p-3 text-[14px]">
          Submission is in {days} day{days === 1 ? "" : "s"}. {notStartedCount} checklist items are not yet started.
        </div>
      )}

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {[{ id: "all", label: "All" }, ...STATUSES.map((s) => ({ id: s.value, label: s.label }))].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-2 text-[14px] border-b-2 whitespace-nowrap ${
              filter === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {t.label} <span className="text-[12px] opacity-60">({counts[t.id] ?? 0})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No checklist items yet"
          description="IRIS will extract submission requirements automatically when you upload the RFP. You can also add items manually."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => {
            const overdue = isOverdue(i);
            const isExp = expanded.has(i.id);
            return (
              <div
                key={i.id}
                draggable
                onDragStart={() => setDragId(i.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i.id)}
                className="rounded-lg border border-border bg-card p-3 flex items-start gap-3"
              >
                <GripVertical className="size-4 text-muted-foreground mt-1 cursor-grab" />
                <Checkbox
                  className="mt-1 size-5"
                  checked={i.status === "complete" || i.status === "verified"}
                  onCheckedChange={(v) => update(i.id, { status: v ? "complete" : "not_started" })}
                />
                <div className="flex-1 min-w-0 space-y-2">
                  <button
                    className="text-left block"
                    onClick={() => {
                      const next = new Set(expanded);
                      next.has(i.id) ? next.delete(i.id) : next.add(i.id);
                      setExpanded(next);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.label}</span>
                      {i.iris_extracted && (
                        <Badge className="bg-primary/15 text-primary border-primary/30">IRIS Extracted</Badge>
                      )}
                      {overdue && (
                        <Badge className="bg-red-500/15 text-red-500 border-red-500/30">Overdue</Badge>
                      )}
                      <Badge className={STATUS_COLORS[i.status] ?? ""} variant="outline">
                        {STATUSES.find((s) => s.value === i.status)?.label ?? i.status}
                      </Badge>
                    </div>
                    {i.description && (
                      <p className={cn("text-[14px] text-muted-foreground mt-1", !isExp && "line-clamp-2")}>
                        {i.description}
                      </p>
                    )}
                  </button>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Select
                      value={i.owner_id ?? "none"}
                      onValueChange={(v) => update(i.id, { owner_id: v === "none" ? null : v })}
                    >
                      <SelectTrigger className="h-8 w-48 text-[12px]">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Unassigned</SelectItem>
                        {(team ?? []).map((m) => (
                          <SelectItem key={m.member_id} value={m.member_id}>
                            {memberName(m.member_id) ?? m.member_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-[12px]">
                          <CalendarIcon className="size-3 mr-1" />
                          {i.due_date ? format(new Date(i.due_date), "MMM d, yyyy") : "Set due date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={i.due_date ? new Date(i.due_date) : undefined}
                          onSelect={(d) => update(i.id, { due_date: d ? d.toISOString() : null })}
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <Select value={i.status} onValueChange={(v) => update(i.id, { status: v })}>
                      <SelectTrigger className="h-8 w-36 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => remove(i.id)} className="text-red-500">
                      <Trash2 className="size-4 mr-2" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        missionId={missionId}
        team={team ?? []}
        memberName={memberName}
        nextOrder={items?.length ?? 0}
        onSaved={() => qc.invalidateQueries({ queryKey: ["submission-checklist", missionId] })}
      />
    </div>
  );
}

function AddItemDialog({
  open, onOpenChange, missionId, team, memberName, nextOrder, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  missionId: string;
  team: { member_id: string }[];
  memberName: (id: string | null) => string | null;
  nextOrder: number;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [ownerId, setOwnerId] = useState("none");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!label.trim()) { toast.error("Item name is required."); return; }
    setSaving(true);
    const { error } = await supabase.from("mission_submission_checklist").insert({
      mission_id: missionId,
      category: "submission",
      label: label.trim(),
      description: description.trim() || null,
      owner_id: ownerId === "none" ? null : ownerId,
      due_date: dueDate ? dueDate.toISOString() : null,
      status: "not_started",
      is_complete: false,
      iris_extracted: false,
      order_index: nextOrder,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Checklist item added" });
    setLabel(""); setDescription(""); setOwnerId("none"); setDueDate(undefined);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Checklist Item</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Item Name *</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label>Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {team.map((m) => (
                  <SelectItem key={m.member_id} value={m.member_id}>
                    {memberName(m.member_id) ?? m.member_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="size-4 mr-2" />
                  {dueDate ? format(dueDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dueDate} onSelect={setDueDate} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
