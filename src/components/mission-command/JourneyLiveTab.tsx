import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Check, Diamond } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsAdmin, useCurrentUser, logAudit } from "@/lib/mission-helpers";

type Phase = {
  id: string;
  mission_id: string;
  name: string;
  kind: string | null;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  is_locked: boolean;
  is_cleared: boolean;
  cleared_by: string | null;
  cleared_at: string | null;
  order_index: number | null;
};
type Deliverable = {
  id: string;
  phase_id: string;
  title: string;
  description: string | null;
  owner_member_id: string | null;
  due_date: string | null;
  status: string;
};

export function JourneyLiveTab({ missionId, deadline }: { missionId: string; deadline: string | null }) {
  const qc = useQueryClient();
  const { data: isAdmin } = useIsAdmin();
  const { data: user } = useCurrentUser();
  const [gateTarget, setGateTarget] = useState<Phase | null>(null);
  const [dateWarning, setDateWarning] = useState<{ phase: Phase; field: "start_date" | "end_date"; date: Date } | null>(null);

  const { data: phases, isLoading } = useQuery({
    queryKey: ["live-phases", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_journey_phases")
        .select("*")
        .eq("mission_id", missionId)
        .order("order_index");
      return (data ?? []) as Phase[];
    },
  });

  const { data: deliverables } = useQuery({
    queryKey: ["live-deliverables", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_journey_deliverables")
        .select("*")
        .eq("mission_id", missionId)
        .order("order_index");
      return (data ?? []) as Deliverable[];
    },
  });

  // is engagement lead?
  const { data: isEngLead } = useQuery({
    queryKey: ["is-eng-lead-j", missionId, user?.email],
    enabled: !!user?.email,
    queryFn: async () => {
      const { data: atlas } = await supabase.from("atlas_team_members").select("id").eq("email", user!.email!).maybeSingle();
      if (!atlas?.id) return false;
      const { data } = await supabase.from("mission_team_members")
        .select("mission_role").eq("mission_id", missionId).eq("member_id", atlas.id).maybeSingle();
      return data?.mission_role === "engagement_lead";
    },
  });

  // Auto-recalc overdue
  useEffect(() => {
    if (!deliverables) return;
    const now = Date.now();
    const overdue = deliverables.filter((d) => d.due_date && new Date(d.due_date).getTime() < now
      && d.status !== "complete" && d.status !== "overdue");
    if (!overdue.length) return;
    (async () => {
      await Promise.all(overdue.map((d) =>
        supabase.from("mission_journey_deliverables").update({ status: "overdue" }).eq("id", d.id),
      ));
      qc.invalidateQueries({ queryKey: ["live-deliverables", missionId] });
    })();
  }, [deliverables, missionId, qc]);

  const today = new Date();

  const phaseState = (p: Phase): { fill: string; border: string; label: string } => {
    const end = p.end_date ? new Date(p.end_date) : null;
    const start = p.start_date ? new Date(p.start_date) : null;
    const isCurrent = start && end && today >= start && today <= end;
    const isCompleted = end && end < today;
    const phaseDelivs = (deliverables ?? []).filter((d) => d.phase_id === p.id);
    const anyDone = phaseDelivs.some((d) => d.status === "complete");
    const isOverdue = end && end < today && phaseDelivs.length > 0 && !anyDone;
    if (p.kind === "pens_down") return { fill: "bg-red-500", border: "border-red-500", label: "Pens Down" };
    if (isOverdue) return { fill: "bg-red-500", border: "border-red-500", label: "Overdue" };
    if (isCurrent) return { fill: p.color ? "" : "bg-primary/30", border: "border-primary", label: "Current" };
    if (isCompleted) return { fill: "bg-emerald-500/40", border: "border-emerald-500/40", label: "Done" };
    return { fill: p.color ? "" : "bg-muted", border: "border-border", label: "Upcoming" };
  };

  const clearGate = async (p: Phase) => {
    const { error } = await supabase
      .from("mission_journey_phases")
      .update({ is_cleared: true, cleared_by: user?.id ?? null, cleared_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    const { data: team } = await supabase.from("mission_team_members").select("member_id").eq("mission_id", missionId);
    const notifs = (team ?? []).map((t) => ({
      recipient_id: t.member_id, recipient_role: "specific_user",
      type: "gate_cleared",
      message: `Gate ${p.name} has been cleared. The mission is advancing to the next phase. Review your assignments.`,
      metadata: { mission_id: missionId, phase_id: p.id },
    }));
    if (notifs.length) await supabase.from("atlas_notifications").insert(notifs);
    await logAudit({ missionId, action: "Gate cleared", metadata: { phase_id: p.id, phase_name: p.name } });
    toast.success("Gate cleared. Team notified.");
    setGateTarget(null);
    qc.invalidateQueries({ queryKey: ["live-phases", missionId] });
  };

  const updateDelivStatus = async (d: Deliverable, status: string) => {
    await supabase.from("mission_journey_deliverables").update({ status }).eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["live-deliverables", missionId] });
  };

  const updatePhaseDate = async (p: Phase, field: "start_date" | "end_date", date: Date) => {
    if (p.kind === "pens_down" && field === "end_date") {
      toast.error("Pens Down end date is locked to the submission deadline.");
      return;
    }
    if (deadline && date > new Date(deadline)) {
      toast.error("Cannot move past submission deadline.");
      return;
    }
    setDateWarning({ phase: p, field, date });
  };

  const confirmDate = async () => {
    if (!dateWarning) return;
    const { phase, field, date } = dateWarning;
    const { error } = await supabase
      .from("mission_journey_phases").update({ [field]: date.toISOString() }).eq("id", phase.id);
    setDateWarning(null);
    if (error) { toast.error(error.message); return; }
    await logAudit({ missionId, action: "Phase date adjusted", metadata: { phase_id: phase.id, field } });
    qc.invalidateQueries({ queryKey: ["live-phases", missionId] });
  };

  const timelineBounds = useMemo(() => {
    if (!phases?.length) return null;
    const starts = phases.map((p) => p.start_date ? new Date(p.start_date).getTime() : Infinity);
    const ends = phases.map((p) => p.end_date ? new Date(p.end_date).getTime() : -Infinity);
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    if (!isFinite(min) || !isFinite(max) || max <= min) return null;
    return { min, max };
  }, [phases]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!phases?.length) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        No journey phases configured. Build the journey in Mission Setup.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Mission Journey</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Live mission timeline. Adjust phases within constraints. Engagement Leads clear gates.
        </p>
      </div>

      {/* Timeline */}
      {timelineBounds && (
        <div className="rounded-lg border p-4 overflow-x-auto">
          <div className="relative h-20 min-w-full">
            {phases.map((p) => {
              const state = phaseState(p);
              const s = p.start_date ? new Date(p.start_date).getTime() : timelineBounds.min;
              const e = p.end_date ? new Date(p.end_date).getTime() : timelineBounds.max;
              const left = ((s - timelineBounds.min) / (timelineBounds.max - timelineBounds.min)) * 100;
              const width = ((e - s) / (timelineBounds.max - timelineBounds.min)) * 100;
              return (
                <div
                  key={p.id}
                  className={`absolute top-2 h-12 rounded border-2 ${state.border} ${state.fill} px-1 text-xs flex items-center justify-center overflow-hidden`}
                  style={{
                    left: `${left}%`, width: `${Math.max(width, 1)}%`,
                    backgroundColor: !state.fill ? (p.color ?? undefined) : undefined,
                  }}
                  title={p.name}
                >
                  {p.kind === "gate" && (
                    p.is_cleared
                      ? <Check className="size-4 text-emerald-500" />
                      : <Diamond className="size-4 text-primary" />
                  )}
                  <span className="truncate ml-1">{p.name}</span>
                </div>
              );
            })}
            {/* Today marker */}
            {today.getTime() >= timelineBounds.min && today.getTime() <= timelineBounds.max && (
              <div
                className="absolute top-0 h-20 border-l border-dashed border-primary"
                style={{ left: `${((today.getTime() - timelineBounds.min) / (timelineBounds.max - timelineBounds.min)) * 100}%` }}
              >
                <span className="absolute -top-5 left-1 text-[10px] text-primary">Today</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phase cards */}
      <div className="space-y-3">
        {phases.map((p) => {
          const state = phaseState(p);
          const phaseDelivs = (deliverables ?? []).filter((d) => d.phase_id === p.id);
          const canClear = (isAdmin || isEngLead) && p.kind === "gate" && !p.is_cleared;
          return (
            <div key={p.id} className={`rounded-lg border-2 ${state.border} p-4 space-y-2`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Badge variant="outline">{state.label}</Badge>
                  {p.kind === "gate" && p.is_cleared && <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Cleared</Badge>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <DatePop label="Start" date={p.start_date} disabled={p.is_locked || !isAdmin}
                           onPick={(d) => updatePhaseDate(p, "start_date", d)} />
                  <DatePop label="End" date={p.end_date} disabled={p.is_locked || !isAdmin || p.kind === "pens_down"}
                           onPick={(d) => updatePhaseDate(p, "end_date", d)} />
                  {canClear && <Button size="sm" onClick={() => setGateTarget(p)}>Clear Gate</Button>}
                </div>
              </div>

              {phaseDelivs.length > 0 && (
                <div className="space-y-1 pl-3 border-l border-border">
                  {phaseDelivs.map((d) => {
                    const overdue = d.due_date && new Date(d.due_date) < today && d.status !== "complete";
                    return (
                      <div key={d.id} className="flex items-start gap-2 text-sm py-1">
                        <Checkbox
                          checked={d.status === "complete"}
                          onCheckedChange={(v) => updateDelivStatus(d, v ? "complete" : "not_started")}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={d.status === "complete" ? "line-through text-muted-foreground" : ""}>{d.title}</span>
                            {d.due_date && (
                              <span className={`text-xs ${overdue ? "text-red-500" : "text-muted-foreground"}`}>
                                Due {format(new Date(d.due_date), "MMM d")}
                              </span>
                            )}
                            {d.status === "overdue" && (
                              <Badge className="bg-red-500/15 text-red-500 border-red-500/30">Overdue</Badge>
                            )}
                          </div>
                          {d.description && <p className="text-xs text-muted-foreground">{d.description}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!gateTarget} onOpenChange={(o) => !o && setGateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear gate?</AlertDialogTitle>
            <AlertDialogDescription>
              Clearing this gate signals the mission is ready to advance to the next phase. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => gateTarget && clearGate(gateTarget)}>Clear Gate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dateWarning} onOpenChange={(o) => !o && setDateWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change phase date?</AlertDialogTitle>
            <AlertDialogDescription>
              Changing this date affects deliverables in this phase. Some may become overdue. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDate}>Continue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DatePop({ label, date, disabled, onPick }: {
  label: string; date: string | null; disabled?: boolean; onPick: (d: Date) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="h-7 text-xs">
          {label}: {date ? format(new Date(date), "MMM d") : "—"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date ? new Date(date) : undefined}
                  onSelect={(d) => d && onPick(d)} className="pointer-events-auto" />
      </PopoverContent>
    </Popover>
  );
}
