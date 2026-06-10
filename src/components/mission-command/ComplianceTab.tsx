import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { AlertTriangle, Plus, MoreVertical, Pencil, Trash2, Download } from "lucide-react";
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { downloadCsv, logAudit, slugForFilename } from "@/lib/mission-helpers";

type Req = {
  id: string;
  mission_id: string;
  requirement: string;
  source: string | null;
  section_id: string | null;
  owner_id: string | null;
  status: string;
  is_high_risk: boolean;
  iris_extracted: boolean;
};

const STATUSES = [
  { value: "not_addressed", label: "Not Addressed" },
  { value: "in_progress", label: "In Progress" },
  { value: "addressed", label: "Addressed" },
  { value: "verified", label: "Verified" },
];

const STATUS_COLORS: Record<string, string> = {
  not_addressed: "bg-red-500/15 text-red-500 border-red-500/30",
  in_progress: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  addressed: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  verified: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

export function ComplianceTab({
  missionId, missionName, deadline,
}: {
  missionId: string; missionName: string; deadline: string | null;
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Req | null>(null);
  const [delTarget, setDelTarget] = useState<Req | null>(null);

  const { data: reqs, isLoading, isError, refetch } = useQuery({
    queryKey: ["compliance", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_compliance_requirements")
        .select("*")
        .eq("mission_id", missionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Req[];
    },
  });

  const { data: sections } = useQuery({
    queryKey: ["mission-sections-min", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_sections")
        .select("id, section_number, name")
        .eq("mission_id", missionId)
        .order("order_index");
      return data ?? [];
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

  const sectionName = (id: string | null) => {
    if (!id) return null;
    const s = sections?.find((x) => x.id === id);
    return s ? `${s.section_number ?? ""} ${s.name}`.trim() : null;
  };
  const memberName = (id: string | null) => {
    if (!id) return null;
    const m = team?.find((x) => x.member_id === id);
    if (!m?.atlas_team_members) return null;
    return `${m.atlas_team_members.first_name ?? ""} ${m.atlas_team_members.last_name ?? ""}`.trim();
  };

  const filtered = useMemo(() => {
    const list = (reqs ?? []).filter((r) => filter === "all" || r.status === filter);
    list.sort((a, b) => (a.is_high_risk === b.is_high_risk ? 0 : a.is_high_risk ? -1 : 1));
    return list;
  }, [reqs, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: reqs?.length ?? 0,
      not_addressed: 0, in_progress: 0, addressed: 0, verified: 0,
    };
    (reqs ?? []).forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [reqs]);

  const total = reqs?.length ?? 0;
  const done = (counts.addressed ?? 0) + (counts.verified ?? 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";

  const daysToDeadline = deadline
    ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000)
    : null;
  const highRiskUnaddressed = (reqs ?? []).filter(
    (r) => r.is_high_risk && r.status === "not_addressed",
  ).length;
  const showWarning =
    highRiskUnaddressed > 0 && daysToDeadline !== null && daysToDeadline <= 30;

  const update = async (id: string, patch: Partial<Req>) => {
    const { error } = await supabase
      .from("mission_compliance_requirements")
      .update(patch)
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["compliance", missionId] });
  };

  const remove = async (r: Req) => {
    const { error } = await supabase
      .from("mission_compliance_requirements")
      .delete()
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Compliance requirement deleted", metadata: { id: r.id } });
    toast.success("Requirement deleted.");
    setDelTarget(null);
    qc.invalidateQueries({ queryKey: ["compliance", missionId] });
  };

  const onExport = () => {
    const rows = (reqs ?? []).map((r) => ({
      requirement: r.requirement,
      source: r.source ?? "",
      section: sectionName(r.section_id) ?? "",
      owner: memberName(r.owner_id) ?? "",
      status: r.status,
      high_risk: r.is_high_risk ? "yes" : "no",
      iris_extracted: r.iris_extracted ? "yes" : "no",
    }));
    const date = format(new Date(), "yyyy-MM-dd");
    downloadCsv(`${slugForFilename(missionName)}-compliance-matrix-${date}.csv`, rows);
  };

  if (isError) return <ErrorState message="Couldn't load compliance requirements." onRetry={() => refetch()} />;
  if (isLoading) return <SkeletonRows rows={5} height="h-20" />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Compliance Tracker</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every mandatory requirement must be addressed before submission.
          </p>
        </div>
        <Button
          variant="outline"
          className="border-primary text-primary hover:bg-primary/10"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="size-4 mr-2" />Add Requirement
        </Button>
      </div>

      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex gap-2 text-sm">
        <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
        <span>Missing a compliance requirement is an automatic disqualifier. Review every item.</span>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{done} of {total} requirements addressed</span>
          <span className="font-medium">{pct}%</span>
        </div>
        <div className="h-2 w-full bg-muted rounded overflow-hidden">
          <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {showWarning && (
        <div className="rounded-lg bg-red-600 text-white p-3 font-medium text-sm">
          WARNING: {highRiskUnaddressed} high-risk requirements are unaddressed.
          Submission is in {daysToDeadline} day{daysToDeadline === 1 ? "" : "s"}.
        </div>
      )}

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {[
          { id: "all", label: "All" },
          ...STATUSES.map((s) => ({ id: s.value, label: s.label })),
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-2 text-sm border-b-2 whitespace-nowrap ${
              filter === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t.label} <span className="text-xs opacity-60">({counts[t.id] ?? 0})</span>
          </button>
        ))}
        <div className="ml-auto py-1">
          <Button variant="ghost" size="sm" onClick={onExport}>
            <Download className="size-4 mr-1" />Export
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No compliance requirements"
          description="IRIS may not have found explicit requirements in your RFP. Add them manually."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const isExp = expanded.has(r.id);
            const text = isExp || r.requirement.length <= 160
              ? r.requirement
              : r.requirement.slice(0, 160) + "…";
            return (
              <div key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={r.status === "addressed" || r.status === "verified"}
                    onCheckedChange={(v) => update(r.id, { status: v ? "addressed" : "not_addressed" })}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {r.is_high_risk && (
                        <Badge className="bg-red-500/15 text-red-500 border-red-500/30">High Risk</Badge>
                      )}
                      {r.iris_extracted && (
                        <Badge className="bg-primary/15 text-primary border-primary/30">IRIS Extracted</Badge>
                      )}
                      <Badge className={STATUS_COLORS[r.status] ?? ""} variant="outline">
                        {STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
                      </Badge>
                    </div>
                    <button
                      className="text-sm text-left block"
                      onClick={() => {
                        const next = new Set(expanded);
                        next.has(r.id) ? next.delete(r.id) : next.add(r.id);
                        setExpanded(next);
                      }}
                    >
                      {text}
                    </button>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {r.source && <span>Source: {r.source}</span>}
                      <span>
                        Section:{" "}
                        {sectionName(r.section_id) ?? (
                          <span className="opacity-60">None assigned</span>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select
                        value={r.owner_id ?? "none"}
                        onValueChange={(v) => update(r.id, { owner_id: v === "none" ? null : v })}
                      >
                        <SelectTrigger className="h-8 w-48 text-xs">
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
                      <Select value={r.status} onValueChange={(v) => update(r.id, { status: v })}>
                        <SelectTrigger className="h-8 w-40 text-xs">
                          <SelectValue />
                        </SelectTrigger>
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
                      <DropdownMenuItem onClick={() => setEditing(r)}>
                        <Pencil className="size-4 mr-2" />Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDelTarget(r)} className="text-red-500">
                        <Trash2 className="size-4 mr-2" />Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReqDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        missionId={missionId}
        sections={sections ?? []}
        team={team ?? []}
        memberName={memberName}
        onSaved={() => qc.invalidateQueries({ queryKey: ["compliance", missionId] })}
      />

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="overflow-y-auto">
          {editing && (
            <EditReqForm
              req={editing}
              sections={sections ?? []}
              team={team ?? []}
              memberName={memberName}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                qc.invalidateQueries({ queryKey: ["compliance", missionId] });
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete requirement?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => delTarget && remove(delTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReqDialog({
  open, onOpenChange, missionId, sections, team, memberName, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  missionId: string;
  sections: { id: string; section_number: string | null; name: string | null }[];
  team: { member_id: string }[];
  memberName: (id: string | null) => string | null;
  onSaved: () => void;
}) {
  const [requirement, setRequirement] = useState("");
  const [source, setSource] = useState("");
  const [sectionId, setSectionId] = useState<string>("none");
  const [ownerId, setOwnerId] = useState<string>("none");
  const [highRisk, setHighRisk] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!requirement.trim()) { toast.error("Requirement text is required."); return; }
    setSaving(true);
    const { error } = await supabase.from("mission_compliance_requirements").insert({
      mission_id: missionId,
      requirement: requirement.trim(),
      source: source.trim() || null,
      section_id: sectionId === "none" ? null : sectionId,
      owner_id: ownerId === "none" ? null : ownerId,
      status: "not_addressed",
      is_high_risk: highRisk,
      iris_extracted: false,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Compliance requirement added" });
    toast.success("Requirement added.");
    setRequirement(""); setSource(""); setSectionId("none"); setOwnerId("none"); setHighRisk(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Requirement</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Requirement *</Label>
            <Textarea rows={4} value={requirement} onChange={(e) => setRequirement(e.target.value)} />
          </div>
          <div>
            <Label>Source</Label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. RFP §3.2" />
          </div>
          <div>
            <Label>Section Responsible</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {`${s.section_number ?? ""} ${s.name}`.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={highRisk} onCheckedChange={(v) => setHighRisk(!!v)} />
            High Risk
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditReqForm({
  req, sections, team, memberName, onClose, onSaved,
}: {
  req: Req;
  sections: { id: string; section_number: string | null; name: string | null }[];
  team: { member_id: string }[];
  memberName: (id: string | null) => string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [requirement, setRequirement] = useState(req.requirement);
  const [source, setSource] = useState(req.source ?? "");
  const [sectionId, setSectionId] = useState<string>(req.section_id ?? "none");
  const [ownerId, setOwnerId] = useState<string>(req.owner_id ?? "none");
  const [highRisk, setHighRisk] = useState(req.is_high_risk);
  const [status, setStatus] = useState(req.status);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("mission_compliance_requirements")
      .update({
        requirement, source: source || null,
        section_id: sectionId === "none" ? null : sectionId,
        owner_id: ownerId === "none" ? null : ownerId,
        is_high_risk: highRisk, status,
      })
      .eq("id", req.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved.");
    onSaved();
  };

  return (
    <>
      <SheetHeader><SheetTitle>Edit Requirement</SheetTitle></SheetHeader>
      <div className="space-y-3 py-4">
        <div>
          <Label>Requirement</Label>
          <Textarea rows={5} value={requirement} onChange={(e) => setRequirement(e.target.value)} />
        </div>
        <div>
          <Label>Source</Label>
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <div>
          <Label>Section</Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {`${s.section_number ?? ""} ${s.name}`.trim()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={highRisk} onCheckedChange={(v) => setHighRisk(!!v)} />
          High Risk
        </label>
      </div>
      <SheetFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={saving}>Save</Button>
      </SheetFooter>
    </>
  );
}
