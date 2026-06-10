import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  X,
  Star,
  Sparkles,
  Minus,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";
import {
  TEMPLATE_PHASES,
  defaultDurations,
  computePhasesFromDurations,
  adjustDurations,
  durationsFromPhases,
  dateToISO,
  type TemplatePhaseKey,
} from "@/lib/journey-template";
import { assessJourneyTimeline } from "@/lib/journey-assessment.functions";

// ---------- types & constants ----------
export type PhaseType = "planning" | "drafting" | "review" | "gate" | "pens_down";

const TYPE_META: Record<PhaseType, { label: string; color: string }> = {
  planning: { label: "Planning", color: "#4A6FA5" },
  drafting: { label: "Drafting", color: "#0D1B3E" },
  review: { label: "Review", color: "#D4800A" },
  gate: { label: "Gate", color: "#C49A2B" },
  pens_down: { label: "Pens Down", color: "#C0392B" },
};
const TYPE_ORDER: PhaseType[] = ["planning", "drafting", "review", "gate", "pens_down"];

type Phase = {
  id: string;
  mission_id: string;
  name: string;
  kind: PhaseType;
  color: string | null;
  start_date: string;
  end_date: string;
  order_index: number;
};
type Deliverable = {
  id: string;
  mission_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  owner_member_id: string | null;
  due_date: string | null;
  status: string;
  order_index: number;
};
type TeamOption = { id: string; label: string };

// ---------- helpers ----------
const toISO = (d: string) => (d ? new Date(d + "T12:00:00").toISOString() : "");
const toDateInput = (iso: string | null | undefined) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : "";
const dayDiff = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 86_400_000);
const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

function overlaps(aS: string, aE: string, bS: string, bE: string) {
  const as = new Date(aS).getTime();
  const ae = new Date(aE).getTime();
  const bs = new Date(bS).getTime();
  const be = new Date(bE).getTime();
  return as <= be && bs <= ae;
}

// ---------- data ----------
async function fetchAll(missionId: string) {
  const [mission, phases, deliverables, team] = await Promise.all([
    supabase.from("missions").select("id, submission_deadline").eq("id", missionId).single(),
    supabase
      .from("mission_journey_phases")
      .select("id, mission_id, name, kind, color, start_date, end_date, order_index")
      .eq("mission_id", missionId)
      .order("order_index", { ascending: true }),
    supabase
      .from("mission_journey_deliverables")
      .select("id, mission_id, phase_id, title, description, owner_member_id, due_date, status, order_index")
      .eq("mission_id", missionId)
      .order("order_index", { ascending: true }),
    supabase
      .from("mission_team_members")
      .select("member_id, atlas_team_members:member_id(first_name, last_name, email)")
      .eq("mission_id", missionId),
  ]);
  if (mission.error) throw mission.error;

  const teamOptions: TeamOption[] = ((team.data ?? []) as unknown as Array<{
    member_id: string;
    atlas_team_members: { first_name: string | null; last_name: string | null; email: string } | null;
  }>).map((row) => {
    const a = row.atlas_team_members;
    const name = [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim();
    return { id: row.member_id, label: name || a?.email || "Team member" };
  });

  return {
    deadline: mission.data.submission_deadline as string,
    phases: (phases.data ?? []) as Phase[],
    deliverables: (deliverables.data ?? []) as Deliverable[],
    team: teamOptions,
  };
}

// ---------- main component ----------
export function Step4Journey({ missionId }: { missionId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["journey", missionId],
    queryFn: () => fetchAll(missionId),
  });

  const [panel, setPanel] = useState<{ open: boolean; editing?: Phase }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<Phase | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(`journey-banner-dismissed:${missionId}`) === "1";
  });
  const [mode, setMode] = useState<"template" | "fresh" | null>(() => {
    if (typeof window === "undefined") return null;
    const v = sessionStorage.getItem(`journey-mode:${missionId}`);
    return v === "template" || v === "fresh" ? v : null;
  });
  const [applying, setApplying] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const { deadline, phases, deliverables, team } = data;
  const pensDownCount = phases.filter((p) => p.kind === "pens_down").length;
  const canContinue = phases.length >= 2 && pensDownCount >= 1;
  const refresh = () => qc.invalidateQueries({ queryKey: ["journey", missionId] });

  // Template selection screen — show when no phases yet and user hasn't picked a mode
  if (phases.length === 0 && mode === null && !applying) {
    return (
      <TemplateSelection
        deadline={deadline}
        onUseTemplate={async () => {
          setApplying(true);
          try {
            const startedAt = Date.now();
            await applyAthenaTemplate(missionId, deadline, team);
            sessionStorage.setItem(`journey-mode:${missionId}`, "template");
            setMode("template");
            // Keep loading state visible for at least 1.5s
            const elapsed = Date.now() - startedAt;
            if (elapsed < 1500) {
              await new Promise((r) => setTimeout(r, 1500 - elapsed));
            }
            await refresh();
            toast.success("Athena Standard journey loaded.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to load template");
          } finally {
            setApplying(false);
          }
        }}
        onStartFresh={() => {
          sessionStorage.setItem(`journey-mode:${missionId}`, "fresh");
          setMode("fresh");
        }}
      />
    );
  }

  if (applying) {
    return <TemplateApplyingState />;
  }

  // Calculate timeline metrics for the summary + IRIS card
  const today = new Date();
  const deadlineDate = new Date(deadline);
  const totalMissionDays = Math.max(0, Math.round((deadlineDate.getTime() - today.getTime()) / 86_400_000));
  const findByName = (n: string) =>
    phases.find((p) => p.name.trim().toLowerCase() === n.toLowerCase());
  const writersWrite = findByName("Writers Write");
  const writersDays = writersWrite
    ? Math.max(1, Math.round((new Date(writersWrite.end_date).getTime() - new Date(writersWrite.start_date).getTime()) / 86_400_000))
    : 0;
  const reviewPhaseNames = ["Red Team Draft Due", "Mock Score", "Gold Team", "Quality Control", "Executive Review"];
  const reviewDays = reviewPhaseNames.reduce((s, name) => {
    const p = findByName(name);
    if (!p) return s;
    return s + Math.max(1, Math.round((new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / 86_400_000));
  }, 0);
  const pensDown = phases.find((p) => p.kind === "pens_down");
  const daysToPensDown = pensDown ? Math.max(0, Math.round((new Date(pensDown.end_date).getTime() - today.getTime()) / 86_400_000)) : totalMissionDays;

  // Buffer days: total mission days minus calendar days actually covered by phases
  let bufferDays = 0;
  if (phases.length > 0) {
    const ranges = phases.map((p) => [new Date(p.start_date).getTime(), new Date(p.end_date).getTime()] as const)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let curStart = ranges[0][0];
    let curEnd = ranges[0][1];
    for (let i = 1; i < ranges.length; i++) {
      const [s, e] = ranges[i];
      if (s <= curEnd) curEnd = Math.max(curEnd, e);
      else {
        covered += Math.round((curEnd - curStart) / 86_400_000);
        curStart = s;
        curEnd = e;
      }
    }
    covered += Math.round((curEnd - curStart) / 86_400_000);
    bufferDays = totalMissionDays - covered;
  }

  // Detect overlaps for the timeline indicator + note
  const overlapPairs: Array<[string, string]> = [];
  for (let i = 0; i < phases.length; i++) {
    for (let j = i + 1; j < phases.length; j++) {
      const a = phases[i], b = phases[j];
      if (a.kind === "gate" || b.kind === "gate") continue;
      if (overlaps(a.start_date, a.end_date, b.start_date, b.end_date)) {
        overlapPairs.push([a.id, b.id]);
      }
    }
  }
  const overlappingIds = new Set(overlapPairs.flat());

  const handleDelete = async (phase: Phase) => {
    const isOnlyPensDown = phase.kind === "pens_down" && pensDownCount === 1;
    if (isOnlyPensDown) {
      toast.error("Cannot delete the only Pens Down phase.");
      return;
    }
    const { error } = await supabase.from("mission_journey_phases").delete().eq("id", phase.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Phase deleted");
    refresh();
  };

  const handleReorder = async (newOrder: Phase[]) => {
    const updates = newOrder.map((p, idx) => ({ id: p.id, order_index: idx }));
    await Promise.all(
      updates.map((u) =>
        supabase.from("mission_journey_phases").update({ order_index: u.order_index }).eq("id", u.id),
      ),
    );
    refresh();
  };

  // Adjust template phase durations (compress/expand/reset)
  const applyDurations = async (durations: Record<TemplatePhaseKey, number>) => {
    const computed = computePhasesFromDurations(deadline, durations);
    const byName = new Map(computed.map((c) => [c.name.toLowerCase(), c]));
    const updates = phases
      .map((p) => {
        const c = byName.get(p.name.trim().toLowerCase());
        if (!c) return null;
        return {
          id: p.id,
          start_date: dateToISO(c.start),
          end_date: dateToISO(c.end),
        };
      })
      .filter((u): u is { id: string; start_date: string; end_date: string } => u !== null);
    await Promise.all(
      updates.map((u) =>
        supabase
          .from("mission_journey_phases")
          .update({ start_date: u.start_date, end_date: u.end_date })
          .eq("id", u.id),
      ),
    );
    refresh();
  };

  const currentDurations = durationsFromPhases(phases);
  const isTemplate = mode === "template" || currentDurations !== null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-semibold text-[var(--athena-navy)] tracking-tight">
          Build the Mission Journey.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Map out your phases, deliverables, and gates. The clock starts at BLAST OFF.
        </p>
      </header>

      {isTemplate && !bannerDismissed && (
        <TemplateBanner
          deadline={deadline}
          onDismiss={() => {
            sessionStorage.setItem(`journey-banner-dismissed:${missionId}`, "1");
            setBannerDismissed(true);
          }}
        />
      )}

      {isTemplate && currentDurations && (
        <QuickAdjustControls
          onCompress={(n) => applyDurations(adjustDurations(currentDurations, n))}
          onExpand={(n) => applyDurations(adjustDurations(currentDurations, -n))}
          onReset={() => setConfirmReset(true)}
        />
      )}

      <Timeline
        phases={phases}
        deadline={deadline}
        onAdd={() => setPanel({ open: true })}
        deliverableCounts={Object.fromEntries(
          phases.map((p) => [p.id, deliverables.filter((d) => d.phase_id === p.id).length]),
        )}
        overlappingIds={overlappingIds}
      />

      {overlapPairs.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {overlapPairs.length} phase{overlapPairs.length === 1 ? "" : "s"} overlap. This is
          supported — overlapping phases allow parallel work streams.
        </p>
      )}

      {phases.length > 0 ? (
        <PhaseCardList
          phases={phases}
          deliverables={deliverables}
          team={team}
          missionId={missionId}
          deadline={deadline}
          onEdit={(p) => setPanel({ open: true, editing: p })}
          onDelete={(p) => setConfirmDelete(p)}
          onReorder={handleReorder}
          onChange={refresh}
        />
      ) : null}

      <JourneySummary
        totalMissionDays={totalMissionDays}
        writersDays={writersDays}
        reviewDays={reviewDays}
        daysToPensDown={daysToPensDown}
        bufferDays={bufferDays}
      />

      {isTemplate && (
        <IrisAssessmentCard
          missionId={missionId}
          deadline={deadline}
          writersDays={writersDays}
          reviewDays={reviewDays}
          daysToSubmission={daysToPensDown}
        />
      )}

      <div className="flex flex-col items-end gap-2 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              navigate({
                to: "/olympus/missions/$missionId/wizard",
                params: { missionId },
                search: { step: 7 },
              })
            }
            title="Skip Journey for now and set up your team. You can return to Journey via the wizard Back button."
          >
            Skip for now — build Team
          </Button>
          <Button
            onClick={() =>
              navigate({
                to: "/olympus/missions/$missionId/wizard",
                params: { missionId },
                search: { step: 7 },
              })
            }
            disabled={!canContinue}
            className={cn(
              "bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold",
              !canContinue && "opacity-40",
            )}
            title={!canContinue ? "Add at least 2 phases including a Pens Down phase to continue" : undefined}
          >
            Continue to Team Assignment →
          </Button>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/olympus/missions" })}
          className="text-xs text-muted-foreground hover:text-foreground underline"
        >
          Save and come back later
        </button>
      </div>

      {panel.open && (
        <PhasePanel
          missionId={missionId}
          deadline={deadline}
          phases={phases}
          existingDeliverables={deliverables}
          team={team}
          editing={panel.editing}
          onClose={() => setPanel({ open: false })}
          onSaved={() => {
            setPanel({ open: false });
            refresh();
          }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete phase?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{confirmDelete?.name}” and its deliverables. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) handleDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={(o) => !o && setConfirmReset(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to template defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all phase dates to the template defaults. Any manual edits will be
              lost. Reset?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmReset(false);
                await applyDurations(defaultDurations(deadline));
                sessionStorage.removeItem(`journey-iris:${missionId}`);
                toast.success("Reset to template defaults.");
              }}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}



// ---------- Timeline ----------
function Timeline({
  phases,
  deadline,
  onAdd,
  deliverableCounts,
  overlappingIds,
}: {
  phases: Phase[];
  deadline: string;
  onAdd: () => void;
  deliverableCounts: Record<string, number>;
  overlappingIds?: Set<string>;
}) {
  const sorted = [...phases].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
  );
  const start = sorted[0]
    ? Math.min(new Date(sorted[0].start_date).getTime(), Date.now())
    : Date.now();
  const end = new Date(deadline).getTime();
  const span = Math.max(end - start, 86_400_000);

  const pct = (t: number) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
  const todayPct = pct(Date.now());

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="relative h-20">
        {/* Today marker */}
        {todayPct >= 0 && todayPct <= 100 && (
          <div
            className="absolute top-0 bottom-0 border-l border-dashed border-[var(--athena-gold)] z-10"
            style={{ left: `${todayPct}%` }}
          >
            <span className="absolute -top-1 -translate-x-1/2 text-[10px] text-[var(--athena-gold)] font-medium">
              Today
            </span>
          </div>
        )}

        {/* Gold line */}
        <div className="absolute left-3 right-3 top-1/2 h-[2px] -translate-y-1/2 bg-[var(--athena-gold)]" />

        {/* Phase blocks */}
        {sorted.map((p) => {
          const left = pct(new Date(p.start_date).getTime());
          const right = pct(new Date(p.end_date).getTime());
          const width = Math.max(right - left, 1.5);
          const meta = TYPE_META[p.kind];
          if (p.kind === "gate") {
            return (
              <div
                key={p.id}
                className="absolute top-1/2 -translate-y-1/2 z-20"
                style={{ left: `calc(${left}% - 8px)` }}
                title={`${p.name} · ${fmt(p.start_date)} · ${deliverableCounts[p.id] ?? 0} deliverables`}
              >
                <div
                  className="h-4 w-4 rotate-45"
                  style={{ background: meta.color, boxShadow: "0 0 0 2px white" }}
                />
              </div>
            );
          }
          return (
            <div
              key={p.id}
              className={cn(
                "absolute top-1/2 -translate-y-1/2 h-7 rounded px-2 text-[11px] text-white flex items-center overflow-hidden whitespace-nowrap",
                overlappingIds?.has(p.id) && "ring-2 ring-amber-400 ring-offset-1",
              )}
              style={{ left: `${left}%`, width: `${width}%`, background: meta.color }}
              title={`${p.name} · ${fmt(p.start_date)} → ${fmt(p.end_date)} · ${deliverableCounts[p.id] ?? 0} deliverables${overlappingIds?.has(p.id) ? " · overlaps with another phase" : ""}`}
            >
              <span className="truncate">{p.name}</span>
            </div>
          );
        })}

        {/* Anchors */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="h-4 w-4 rounded-full bg-[var(--athena-navy)]" />
          <span className="mt-1 text-[10px] text-muted-foreground">Mission Start</span>
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="h-4 w-4 rounded-full bg-[#C0392B]" />
          <span className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">
            Submission Deadline · {fmt(deadline)}
          </span>
        </div>

        {/* Add button */}
        <button
          onClick={onAdd}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 h-7 w-7 rounded-full bg-[var(--athena-gold)] text-[var(--athena-navy)] flex items-center justify-center hover:bg-[var(--athena-gold-light)] shadow-md"
          title="Add phase"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {phases.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Click + to add your first phase.
        </p>
      )}
    </div>
  );
}

// ---------- Phase Cards ----------
function PhaseCardList({
  phases,
  deliverables,
  team,
  missionId,
  deadline,
  onEdit,
  onDelete,
  onReorder,
  onChange,
}: {
  phases: Phase[];
  deliverables: Deliverable[];
  team: TeamOption[];
  missionId: string;
  deadline: string;
  onEdit: (p: Phase) => void;
  onDelete: (p: Phase) => void;
  onReorder: (newOrder: Phase[]) => void;
  onChange: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sorted = useMemo(
    () => [...phases].sort((a, b) => a.order_index - b.order_index),
    [phases],
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sorted.findIndex((p) => p.id === active.id);
    const newIdx = sorted.findIndex((p) => p.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(sorted, oldIdx, newIdx));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sorted.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {sorted.map((p) => (
            <PhaseCard
              key={p.id}
              phase={p}
              deliverables={deliverables.filter((d) => d.phase_id === p.id)}
              team={team}
              missionId={missionId}
              deadline={deadline}
              onEdit={() => onEdit(p)}
              onDelete={() => onDelete(p)}
              onChange={onChange}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function PhaseCard({
  phase,
  deliverables,
  team,
  missionId,
  deadline,
  onEdit,
  onDelete,
  onChange,
}: {
  phase: Phase;
  deliverables: Deliverable[];
  team: TeamOption[];
  missionId: string;
  deadline: string;
  onEdit: () => void;
  onDelete: () => void;
  onChange: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: phase.id,
  });
  const meta = TYPE_META[phase.kind];
  const days = Math.max(
    1,
    dayDiff(new Date(phase.start_date), new Date(phase.end_date)) + 1,
  );

  const addDeliverable = async () => {
    const { error } = await supabase.from("mission_journey_deliverables").insert({
      mission_id: missionId,
      phase_id: phase.id,
      title: "New deliverable",
      status: "not_started",
      order_index: deliverables.length,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange();
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      className="rounded-lg border bg-card overflow-hidden flex"
    >
      <div style={{ background: meta.color }} className="w-1 shrink-0" />
      <div className="flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <button
              {...attributes}
              {...listeners}
              className="text-muted-foreground hover:text-foreground mt-1 cursor-grab active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base">{phase.name}</h3>
                <span
                  className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                  style={{ background: meta.color }}
                >
                  {meta.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmt(phase.start_date)} → {fmt(phase.end_date)} · {days} days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {deliverables.map((d) => (
            <DeliverableRow
              key={d.id}
              deliverable={d}
              team={team}
              phaseStart={phase.start_date}
              phaseEnd={phase.end_date}
              onChange={onChange}
            />
          ))}
          <Button size="sm" variant="outline" onClick={addDeliverable}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Deliverable
          </Button>
          <p className="text-[10px] text-muted-foreground">Deadline: {fmt(deadline)}</p>
        </div>
      </div>
    </div>
  );
}

function DeliverableRow({
  deliverable,
  team,
  phaseStart,
  phaseEnd,
  onChange,
}: {
  deliverable: Deliverable;
  team: TeamOption[];
  phaseStart: string;
  phaseEnd: string;
  onChange: () => void;
}) {
  const [title, setTitle] = useState(deliverable.title);
  const [ownerFreeText, setOwnerFreeText] = useState(deliverable.description ?? "");
  const [ownerId, setOwnerId] = useState(deliverable.owner_member_id ?? "");
  const [dueDate, setDueDate] = useState(toDateInput(deliverable.due_date));

  const save = async (patch: Partial<Deliverable>) => {
    const { error } = await supabase
      .from("mission_journey_deliverables")
      .update(patch)
      .eq("id", deliverable.id);
    if (error) toast.error(error.message);
  };

  const onDueBlur = () => {
    if (!dueDate) {
      void save({ due_date: null });
      return;
    }
    const due = new Date(dueDate).getTime();
    const ps = new Date(phaseStart).getTime();
    const pe = new Date(phaseEnd).getTime();
    if (due < ps || due > pe) {
      const ok = window.confirm("This due date falls outside the phase dates. Continue anyway?");
      if (!ok) {
        setDueDate(toDateInput(deliverable.due_date));
        return;
      }
    }
    void save({ due_date: toISO(dueDate) });
  };

  const remove = async () => {
    const { error } = await supabase
      .from("mission_journey_deliverables")
      .delete()
      .eq("id", deliverable.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange();
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded px-2 py-1.5">
      <Input
        className="col-span-4 h-8"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title !== deliverable.title && save({ title })}
        placeholder="Deliverable name"
      />
      {team.length > 0 ? (
        <select
          className="col-span-3 h-8 text-sm border rounded px-2 bg-background"
          value={ownerId}
          onChange={(e) => {
            setOwnerId(e.target.value);
            void save({ owner_member_id: e.target.value || null });
          }}
        >
          <option value="">Unassigned</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      ) : (
        <Input
          className="col-span-3 h-8"
          placeholder="Owner"
          value={ownerFreeText}
          onChange={(e) => setOwnerFreeText(e.target.value)}
          onBlur={() => ownerFreeText !== (deliverable.description ?? "") && save({ description: ownerFreeText })}
        />
      )}
      <Input
        type="date"
        className="col-span-3 h-8"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        onBlur={onDueBlur}
      />
      <span className="col-span-1 text-[10px] uppercase text-muted-foreground">Not Started</span>
      <button
        type="button"
        onClick={remove}
        className="col-span-1 text-muted-foreground hover:text-destructive justify-self-end"
        aria-label="Remove"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---------- Phase Panel (add/edit) ----------
type PanelDeliverable = {
  id?: string;
  title: string;
  owner_member_id: string | null;
  owner_text: string;
  due_date: string; // YYYY-MM-DD
};

function PhasePanel({
  missionId,
  deadline,
  phases,
  existingDeliverables,
  team,
  editing,
  onClose,
  onSaved,
}: {
  missionId: string;
  deadline: string;
  phases: Phase[];
  existingDeliverables: Deliverable[];
  team: TeamOption[];
  editing?: Phase;
  onClose: () => void;
  onSaved: () => void;
}) {
  const deadlineDate = toDateInput(deadline);
  const [name, setName] = useState(editing?.name ?? "");
  const [kind, setKind] = useState<PhaseType>(editing?.kind ?? "planning");
  const [startDate, setStartDate] = useState(toDateInput(editing?.start_date) || toDateInput(new Date().toISOString()));
  const [endDate, setEndDate] = useState(
    toDateInput(editing?.end_date) || toDateInput(new Date().toISOString()),
  );
  const [deliverables, setDeliverables] = useState<PanelDeliverable[]>(
    editing
      ? existingDeliverables
          .filter((d) => d.phase_id === editing.id)
          .map((d) => ({
            id: d.id,
            title: d.title,
            owner_member_id: d.owner_member_id,
            owner_text: d.description ?? "",
            due_date: toDateInput(d.due_date),
          }))
      : [],
  );
  const [saving, setSaving] = useState(false);

  // Pens Down auto-lock end date
  useEffect(() => {
    if (kind === "pens_down") setEndDate(deadlineDate);
  }, [kind, deadlineDate]);

  const errors: string[] = [];
  if (name.trim() && phases.some((p) => p.id !== editing?.id && p.name.trim().toLowerCase() === name.trim().toLowerCase())) {
    errors.push("A phase with this name already exists.");
  }
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    errors.push("Start date cannot be after end date.");
  }
  if (endDate && new Date(endDate) > new Date(deadline)) {
    errors.push(`End date cannot be after the submission deadline (${fmt(deadline)}).`);
  }
  // Overlap is allowed — phases can run in parallel. Informational only.

  const canSave = name.trim().length > 0 && !!startDate && !!endDate && errors.length === 0 && !saving;

  const handleSave = async () => {
    setSaving(true);
    try {
      const meta = TYPE_META[kind];
      const payload = {
        mission_id: missionId,
        name: name.trim(),
        kind,
        color: meta.color,
        start_date: toISO(startDate),
        end_date: kind === "pens_down" ? deadline : toISO(endDate),
        is_locked: kind === "pens_down",
        order_index: editing?.order_index ?? phases.length,
      };

      let phaseId = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from("mission_journey_phases")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("mission_journey_phases")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        phaseId = data.id;
      }

      // Replace deliverables for this phase
      if (phaseId) {
        await supabase.from("mission_journey_deliverables").delete().eq("phase_id", phaseId);
        const rows = deliverables
          .filter((d) => d.title.trim().length > 0)
          .map((d, idx) => ({
            mission_id: missionId,
            phase_id: phaseId,
            title: d.title.trim(),
            owner_member_id: d.owner_member_id,
            description: d.owner_member_id ? null : d.owner_text || null,
            due_date: d.due_date ? toISO(d.due_date) : null,
            status: "not_started",
            order_index: idx,
          }));
        if (rows.length > 0) {
          const { error } = await supabase.from("mission_journey_deliverables").insert(rows);
          if (error) throw error;
        }
      }

      toast.success(editing ? "Phase updated" : "Phase added");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save phase");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-full md:w-[400px] bg-background border-l shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">{editing ? "Edit Phase" : "Add Phase"}</h2>
          <button onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Phase Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. First Draft, Red Team Review, Pens Down"
            />
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Phase Type
            </label>
            <div className="grid grid-cols-5 gap-1 mt-1">
              {TYPE_ORDER.map((t) => {
                const m = TYPE_META[t];
                const selected = kind === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setKind(t)}
                    className={cn(
                      "text-[10px] py-2 px-1 rounded border transition-all",
                      selected ? "text-white border-transparent" : "bg-muted hover:bg-muted/70",
                    )}
                    style={selected ? { background: m.color } : undefined}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Start Date
              </label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} max={deadlineDate} />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                End Date
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                max={deadlineDate}
                disabled={kind === "pens_down"}
              />
              {kind === "pens_down" && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Pens Down end date is locked to the submission deadline.
                </p>
              )}
            </div>
          </div>

          {errors.map((e) => (
            <p key={e} className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
              {e}
            </p>
          ))}

          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Deliverables
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDeliverables((prev) => [
                    ...prev,
                    { title: "", owner_member_id: null, owner_text: "", due_date: "" },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Deliverable
              </Button>
            </div>

            <div className="space-y-2">
              {deliverables.map((d, i) => (
                <div key={i} className="border rounded p-2 space-y-2 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <Input
                      value={d.title}
                      placeholder="Deliverable name"
                      onChange={(e) =>
                        setDeliverables((prev) =>
                          prev.map((row, idx) => (idx === i ? { ...row, title: e.target.value } : row)),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setDeliverables((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {team.length > 0 ? (
                      <select
                        className="h-9 text-sm border rounded px-2 bg-background"
                        value={d.owner_member_id ?? ""}
                        onChange={(e) =>
                          setDeliverables((prev) =>
                            prev.map((row, idx) =>
                              idx === i ? { ...row, owner_member_id: e.target.value || null } : row,
                            ),
                          )
                        }
                      >
                        <option value="">Unassigned</option>
                        {team.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        placeholder="Owner"
                        value={d.owner_text}
                        onChange={(e) =>
                          setDeliverables((prev) =>
                            prev.map((row, idx) => (idx === i ? { ...row, owner_text: e.target.value } : row)),
                          )
                        }
                      />
                    )}
                    <Input
                      type="date"
                      value={d.due_date}
                      onChange={(e) =>
                        setDeliverables((prev) =>
                          prev.map((row, idx) => (idx === i ? { ...row, due_date: e.target.value } : row)),
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex items-center gap-2">
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "flex-1 bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold",
              !canSave && "opacity-50",
            )}
          >
            Save Phase
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </aside>
    </div>
  );
}

// ---------- Summary ----------
function JourneySummary({
  totalMissionDays,
  writersDays,
  reviewDays,
  daysToPensDown,
  bufferDays,
}: {
  totalMissionDays: number;
  writersDays: number;
  reviewDays: number;
  daysToPensDown: number;
  bufferDays: number;
}) {
  const pensColor =
    daysToPensDown < 14
      ? "text-red-600"
      : daysToPensDown < 30
      ? "text-amber-600"
      : "text-foreground";

  return (
    <div
      className="rounded-lg border-2 p-5 bg-[var(--athena-navy)]/5"
      style={{ borderColor: "var(--athena-gold)" }}
    >
      <h3 className="text-sm uppercase tracking-wider text-[var(--athena-navy)] font-semibold mb-3">
        Journey Summary
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <Stat label="Total mission duration" value={`${totalMissionDays} days from today to submission`} />
        <Stat label="Days for writing" value={`${writersDays} days`} />
        <Stat label="Days for review" value={`${reviewDays} days`} />
        <Stat label="Days to Pens Down" value={`${daysToPensDown} days`} valueClass={pensColor} />
        <Stat
          label="Buffer days"
          value={
            bufferDays >= 0
              ? `${bufferDays} buffer days available`
              : `${Math.abs(bufferDays)} days over deadline`
          }
          valueClass={bufferDays >= 0 ? "text-emerald-700" : "text-amber-700"}
        />
      </div>
      {bufferDays < 0 && (
        <p className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
          Your phases extend past your submission deadline by {Math.abs(bufferDays)} days. Adjust
          phase durations before continuing.
        </p>
      )}
      {bufferDays > 0 && (
        <p className="mt-3 text-xs text-emerald-700/80">
          {bufferDays} buffer days available.
        </p>
      )}
    </div>
  );
}



function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("font-semibold", valueClass)}>{value}</p>
    </div>
  );
}

// ====================================================================
// Athena Standard Template — selection screen, banner, quick adjust,
// IRIS assessment, and the template apply function.
// ====================================================================

function TemplateSelection({
  deadline,
  onUseTemplate,
  onStartFresh,
}: {
  deadline: string;
  onUseTemplate: () => void;
  onStartFresh: () => void;
}) {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-4xl font-semibold text-[var(--athena-navy)] tracking-tight">
          Build the Mission Journey.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Start from the Athena Standard Template or build from scratch.
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Athena Standard */}
        <div className="relative rounded-xl border-2 p-6 bg-card shadow-sm flex flex-col"
          style={{ borderColor: "var(--athena-gold)" }}>
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--athena-gold)] text-[var(--athena-navy)] font-semibold">
            Recommended
          </span>
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-[var(--athena-gold)] fill-[var(--athena-gold)]" />
            <h3 className="font-semibold text-lg text-[var(--athena-navy)]">Athena Standard</h3>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            The proven Athena writing lifecycle. 9 phases auto-calculated backwards from your
            submission deadline ({fmt(deadline)}). Fully editable.
          </p>
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Writers Write → Red Team Draft Due → Mock Score → Writer Recovery → Gold Team →
            Final Drafts → Quality Control → Executive Review → Pens Down
          </p>
          <div className="flex-1" />
          <Button
            onClick={onUseTemplate}
            className="mt-5 bg-[var(--athena-gold)] text-[var(--athena-navy)] hover:bg-[var(--athena-gold-light)] font-semibold"
          >
            Use This Template →
          </Button>
        </div>

        {/* Custom */}
        <div className="rounded-xl border-2 p-6 bg-card shadow-sm flex flex-col"
          style={{ borderColor: "var(--athena-navy)" }}>
          <h3 className="font-semibold text-lg text-[var(--athena-navy)]">Custom Journey</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Build your own phases from scratch. Start with a blank timeline.
          </p>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={onStartFresh}
            className="mt-5 border-[var(--athena-navy)] text-[var(--athena-navy)] hover:bg-[var(--athena-navy)]/5 font-semibold"
          >
            Start Fresh →
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateApplyingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="relative">
        <Sparkles className="h-10 w-10 text-[var(--athena-gold)] animate-pulse" />
      </div>
      <p className="mt-4 text-base font-medium text-[var(--athena-navy)]">
        IRIS is building your journey...
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Calculating 9 phases backwards from your submission deadline.
      </p>
    </div>
  );
}

function TemplateBanner({ deadline, onDismiss }: { deadline: string; onDismiss: () => void }) {
  return (
    <div
      className="rounded-lg border-2 px-4 py-3 flex items-start gap-3"
      style={{ borderColor: "var(--athena-gold)", background: "color-mix(in srgb, var(--athena-gold) 8%, transparent)" }}
    >
      <Star className="h-4 w-4 text-[var(--athena-gold)] fill-[var(--athena-gold)] mt-0.5 shrink-0" />
      <p className="text-sm text-[var(--athena-navy)] flex-1">
        <strong>Athena Standard Template loaded.</strong> All phases are calculated from your
        submission deadline of {fmt(deadline)}. Review and adjust any phase before continuing.
      </p>
      <button
        onClick={onDismiss}
        className="text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Dismiss banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function QuickAdjustControls({
  onCompress,
  onExpand,
  onReset,
}: {
  onCompress: (n: number) => void;
  onExpand: (n: number) => void;
  onReset: () => void;
}) {
  const [compressN, setCompressN] = useState(5);
  const [expandN, setExpandN] = useState(5);
  return (
    <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">Compress by</span>
        <Input
          type="number"
          min={1}
          max={60}
          value={compressN}
          onChange={(e) => setCompressN(Math.max(1, Number(e.target.value) || 1))}
          className="h-8 w-16"
        />
        <span className="text-xs text-muted-foreground mr-1">days</span>
        <Button size="sm" variant="outline" onClick={() => onCompress(compressN)}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">Expand by</span>
        <Input
          type="number"
          min={1}
          max={60}
          value={expandN}
          onChange={(e) => setExpandN(Math.max(1, Number(e.target.value) || 1))}
          className="h-8 w-16"
        />
        <span className="text-xs text-muted-foreground mr-1">days</span>
        <Button size="sm" variant="outline" onClick={() => onExpand(expandN)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-[var(--athena-navy)] underline"
      >
        <RotateCcw className="h-3 w-3" /> Reset to template defaults
      </button>
    </div>
  );
}

function IrisAssessmentCard({
  missionId,
  deadline,
  writersDays,
  reviewDays,
  daysToSubmission,
}: {
  missionId: string;
  deadline: string;
  writersDays: number;
  reviewDays: number;
  daysToSubmission: number;
}) {
  const assess = useServerFn(assessJourneyTimeline);
  const cacheKey = `journey-iris:${missionId}:${deadline}:${writersDays}:${reviewDays}:${daysToSubmission}`;
  const [text, setText] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(cacheKey) ?? "";
  });
  const [loading, setLoading] = useState(false);

  // Hard-coded threshold warnings always shown — independent of AI call.
  const warnings: string[] = [];
  if (daysToSubmission < 45) {
    warnings.push(
      `This is an aggressive timeline. Writers Write gives your team ${writersDays} days for first drafts. Ensure all assignments are accepted within 48 hours of BLAST OFF.`,
    );
  }
  if (writersDays > 0 && writersDays < 20) {
    warnings.push(
      `Writers have ${writersDays} days for first drafts. Consider whether all sections can realistically be drafted in this window.`,
    );
  }

  useEffect(() => {
    if (text) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const missionRes = await supabase
          .from("missions")
          .select("name")
          .eq("id", missionId)
          .single();
        const res = await assess({
          data: {
            missionName: missionRes.data?.name ?? "Mission",
            deadline,
            daysToSubmission,
            writersWriteDays: writersDays,
            totalReviewDays: reviewDays,
          },
        });
        if (cancelled) return;
        const out = res.assessment ?? "";
        setText(out);
        if (out) sessionStorage.setItem(cacheKey, out);
      } catch {
        // Silent — warnings still cover the hard thresholds.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return (
    <div
      className="rounded-lg bg-[var(--athena-navy)] text-white p-4 pl-5 border-l-4"
      style={{ borderLeftColor: "var(--athena-gold)" }}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-[var(--athena-gold)]" />
        <span className="text-[10px] uppercase tracking-widest text-[var(--athena-gold)] font-semibold">
          IRIS
        </span>
      </div>
      {loading && !text && (
        <p className="mt-2 text-sm italic text-white/70">IRIS is reviewing your timeline…</p>
      )}
      {text && <p className="mt-2 text-sm italic">{text}</p>}
      {warnings.map((w) => (
        <p key={w} className="mt-2 text-sm italic text-amber-200">
          {w}
        </p>
      ))}
    </div>
  );
}

// ---------- Template apply ----------

type DeliverableSpec = { title: string; dueOffset: { from: "start" | "end"; days: number } };

const TEMPLATE_DELIVERABLES: Record<TemplatePhaseKey, DeliverableSpec[]> = {
  writers_write: [
    { title: "All question assignments accepted", dueOffset: { from: "start", days: 2 } },
    { title: "First draft outlines submitted", dueOffset: { from: "start", days: 7 } },
  ],
  red_team: [
    { title: "All first drafts submitted to shared workspace", dueOffset: { from: "end", days: 0 } },
  ],
  mock_score: [
    { title: "IRIS mock scoring complete — gaps report distributed", dueOffset: { from: "end", days: 0 } },
  ],
  writer_recovery: [
    { title: "All red team feedback addressed", dueOffset: { from: "end", days: 0 } },
    { title: "Score Me re-run on all revised sections", dueOffset: { from: "end", days: -1 } },
  ],
  gold_team: [
    { title: "Gold Team review complete", dueOffset: { from: "end", days: 0 } },
    { title: "Strategic alignment confirmed", dueOffset: { from: "end", days: 0 } },
  ],
  final_drafts: [
    { title: "All sections finalized and locked", dueOffset: { from: "end", days: 0 } },
  ],
  quality_control: [
    { title: "Compliance matrix verified — all requirements addressed", dueOffset: { from: "end", days: -1 } },
    { title: "Submission package assembled", dueOffset: { from: "end", days: 0 } },
  ],
  executive_review: [
    { title: "Executive sign-off received", dueOffset: { from: "end", days: 0 } },
  ],
  pens_down: [
    { title: "Proposal submitted to client", dueOffset: { from: "end", days: 0 } },
  ],
};

function findEngagementLeadId(team: TeamOption[]): string | null {
  const match = team.find((t) => /engagement/i.test(t.label));
  return match?.id ?? null;
}

async function applyAthenaTemplate(missionId: string, deadline: string, team: TeamOption[]) {
  const durations = defaultDurations(deadline);
  const computed = computePhasesFromDurations(deadline, durations);

  // Insert phases in order
  const phaseRows = TEMPLATE_PHASES.map((spec, idx) => {
    const c = computed[idx];
    const meta = TYPE_META[spec.kind];
    return {
      mission_id: missionId,
      name: spec.name,
      kind: spec.kind,
      color: meta.color,
      start_date: dateToISO(c.start),
      end_date: spec.kind === "pens_down" ? deadline : dateToISO(c.end),
      is_locked: spec.kind === "pens_down",
      order_index: idx,
    };
  });

  const { data: insertedPhases, error: phasesErr } = await supabase
    .from("mission_journey_phases")
    .insert(phaseRows)
    .select("id, name, start_date, end_date, kind");
  if (phasesErr) throw phasesErr;
  if (!insertedPhases) throw new Error("Failed to insert phases");

  // Map phase name -> inserted row
  const phaseByName = new Map(insertedPhases.map((p) => [p.name.toLowerCase(), p]));
  const leadId = findEngagementLeadId(team);
  const leadFallback = leadId ? null : "TBD — assign after team setup";

  const deliverableRows: Array<{
    mission_id: string;
    phase_id: string;
    title: string;
    owner_member_id: string | null;
    description: string | null;
    due_date: string | null;
    status: string;
    order_index: number;
  }> = [];

  for (const spec of TEMPLATE_PHASES) {
    const phase = phaseByName.get(spec.name.toLowerCase());
    if (!phase) continue;
    const items = TEMPLATE_DELIVERABLES[spec.key] ?? [];
    items.forEach((d, idx) => {
      const anchorISO = d.dueOffset.from === "start" ? phase.start_date : phase.end_date;
      if (!anchorISO) return;
      const anchor = new Date(anchorISO);
      const due = new Date(anchor.getTime() + d.dueOffset.days * 86_400_000);
      deliverableRows.push({
        mission_id: missionId,
        phase_id: phase.id,
        title: d.title,
        owner_member_id: leadId,
        description: leadFallback,
        due_date: due.toISOString(),
        status: "not_started",
        order_index: idx,
      });
    });
  }

  if (deliverableRows.length > 0) {
    const { error: dErr } = await supabase
      .from("mission_journey_deliverables")
      .insert(deliverableRows);
    if (dErr) throw dErr;
  }
}

