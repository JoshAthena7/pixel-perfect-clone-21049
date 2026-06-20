import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Download, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useIsAdmin, useCurrentUser, logAudit, downloadCsv, slugForFilename } from "@/lib/mission-helpers";

type Decision = {
  id: string;
  mission_id: string;
  title: string;
  owner: string | null;
  rationale: string | null;
  status: string;
  decided_at: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  communicated: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  implemented: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
};

export function DecisionLogTab({ missionId, missionName }: { missionId: string; missionName: string }) {
  const qc = useQueryClient();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdmin();
  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");

  // Engagement-lead check: see if current user is engagement_lead on this mission
  const { data: user } = useCurrentUser();
  const { data: isEngLead } = useQuery({
    queryKey: ["is-eng-lead", missionId, user?.id],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data: atlas } = await supabase
        .from("atlas_team_members").select("id").eq("email", user!.email!).maybeSingle();
      if (!atlas?.id) return false;
      const { data } = await supabase
        .from("mission_team_members")
        .select("mission_role")
        .eq("mission_id", missionId)
        .eq("member_id", atlas.id)
        .maybeSingle();
      return data?.mission_role === "engagement_lead";
    },
  });

  const allowed = !!isAdmin || !!isEngLead;

  const { data: decisions, isLoading, isError, refetch } = useQuery({
    queryKey: ["decisions", missionId],
    enabled: allowed,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_decisions")
        .select("*")
        .eq("mission_id", missionId)
        .order("decided_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      return (data ?? []) as Decision[];
    },
  });

  const owners = useMemo(() => {
    const s = new Set<string>();
    (decisions ?? []).forEach((d) => d.owner && s.add(d.owner));
    return Array.from(s);
  }, [decisions]);

  const filtered = useMemo(() => {
    return (decisions ?? []).filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (ownerFilter !== "all" && d.owner !== ownerFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${d.title} ${d.rationale ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [decisions, statusFilter, ownerFilter, search]);

  const updateStatus = async (d: Decision, status: string) => {
    const { error } = await supabase.from("mission_decisions").update({ status }).eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["decisions", missionId] });
  };

  const notifyTeam = async (d: Decision) => {
    const { data: team } = await supabase
      .from("mission_team_members").select("member_id").eq("mission_id", missionId);
    const rows = (team ?? []).map((t) => ({
      recipient_id: t.member_id,
      recipient_role: "specific_user",
      type: "decision_communicated",
      message: `Decision: ${d.title}`,
      metadata: { mission_id: missionId, decision_id: d.id },
    }));
    if (rows.length) await supabase.from("atlas_notifications").insert(rows);
    await updateStatus(d, "communicated");
    await logAudit({ missionId, action: "Decision communicated to team", metadata: { decision_id: d.id } });
    toast.success("Team notified of this decision.");
  };

  const markImplemented = async (d: Decision) => {
    await updateStatus(d, "implemented");
    await logAudit({ missionId, action: "Decision marked implemented", metadata: { decision_id: d.id } });
    toast.success("Decision marked as implemented.");
  };

  const onExport = () => {
    const rows = (decisions ?? []).map((d) => ({
      date: d.decided_at ?? d.created_at,
      decision: d.title,
      owner: d.owner ?? "",
      reason: d.rationale ?? "",
      status: d.status,
    }));
    downloadCsv(`${slugForFilename(missionName)}-decisions-${format(new Date(), "yyyy-MM-dd")}.csv`, rows);
  };

  if (roleLoading || isLoading) return <SkeletonRows rows={5} height="h-24" />;
  if (isError) return <ErrorState message="Couldn't load decisions." onRetry={() => refetch()} />;
  if (!allowed) {
    return (
      <EmptyState
        title="Restricted"
        description="This tab is accessible to mission administrators and engagement leads."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-end gap-4">
        <Button variant="outline" className="border-primary text-primary hover:bg-primary/10"
                onClick={() => setAddOpen(true)}>
          <Plus className="size-4 mr-2" />Add Decision
        </Button>
      </div>


      <div className="rounded-lg border bg-muted/30 p-3 text-[14px] text-muted-foreground">
        Decisions are append-only. Once saved they cannot be edited or deleted. This is by design — it creates an honest and auditable record of how the mission evolved.
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search decisions…" value={search}
               onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-9" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="communicated">Communicated</SelectItem>
            <SelectItem value="implemented">Implemented</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="w-48 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Owners</SelectItem>
            {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={onExport} className="ml-auto">
          <Download className="size-4 mr-1" />Export to CSV
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No decisions recorded yet"
          description="Use this log to track every strategic, compliance, and executive decision made on this mission."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <div key={d.id} className="rounded-xl border border-border bg-card p-5 space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="text-[12px] font-medium text-primary tracking-wide">
                  {format(new Date(d.decided_at ?? d.created_at), "MMMM d, yyyy")}
                </div>
                <Badge className={STATUS_COLORS[d.status] ?? ""} variant="outline">
                  {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                </Badge>
              </div>
              <p className="font-medium text-base">{d.title}</p>
              {d.owner && (
                <p className="text-[14px] text-muted-foreground">Decision by {d.owner}</p>
              )}
              {d.rationale && (
                <p className="text-[14px]">
                  <span className="text-muted-foreground font-medium">Why: </span>
                  {d.rationale}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                {(d.status === "open" || d.status === "communicated") && (
                  <Button size="sm" variant="outline" onClick={() => notifyTeam(d)}>
                    Notify Team
                  </Button>
                )}
                {d.status !== "implemented" && (
                  <Button size="sm" onClick={() => markImplemented(d)}>
                    Mark Implemented
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/60 italic">
                Decisions are permanent records and cannot be modified.
              </p>
            </div>
          ))}
        </div>
      )}

      <AddDecisionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        missionId={missionId}
        defaultOwner={user?.user_metadata?.full_name as string | undefined ?? user?.email ?? ""}
        onSaved={() => qc.invalidateQueries({ queryKey: ["decisions", missionId] })}
      />
    </div>
  );
}

function AddDecisionDialog({
  open, onOpenChange, missionId, defaultOwner, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  missionId: string;
  defaultOwner: string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState<Date>(new Date());
  const [decision, setDecision] = useState("");
  const [owner, setOwner] = useState(defaultOwner);
  const [reason, setReason] = useState("");
  const [impact, setImpact] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (decision.trim().length < 20) {
      toast.error("Decision text must be at least 20 characters.");
      return;
    }
    setSaving(true);
    const rationale = [reason, impact && `Affects: ${impact}`].filter(Boolean).join("\n\n");
    const { data, error } = await supabase.from("mission_decisions").insert({
      mission_id: missionId,
      title: decision.trim(),
      owner: owner.trim() || null,
      rationale: rationale || null,
      status: "open",
      decided_at: date.toISOString().slice(0, 10),
    }).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Decision added", metadata: { decision_id: data?.id } });
    toast.success("Decision recorded.");
    setDecision(""); setReason(""); setImpact("");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Decision</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Decision Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarIcon className="size-4 mr-2" />{format(date, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <Label>Decision * <span className="text-[12px] text-muted-foreground">(min 20 chars)</span></Label>
            <Textarea rows={3} value={decision} onChange={(e) => setDecision(e.target.value)} />
          </div>
          <div>
            <Label>Owner</Label>
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} />
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <Label>Impact</Label>
            <Textarea rows={2} value={impact} onChange={(e) => setImpact(e.target.value)}
                      placeholder="Sections, questions, or people affected" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save Decision</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
