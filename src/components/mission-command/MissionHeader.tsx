import { useState } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Plane, Pencil } from "lucide-react";
import { IntelligenceCompletenessChip } from "@/components/mission-command/IntelligenceCompletenessChip";
import { MissionEditPanel } from "@/components/missions/MissionEditPanel";
import { cn } from "@/lib/utils";

type Mission = {
  id: string;
  name: string;
  client_name: string | null;
  status: string | null;
  submission_deadline: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  setup: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  active: "bg-green-500/20 text-green-400 border-green-500/40",
  pens_down: "bg-red-500/20 text-red-400 border-red-500/40",
  submitted: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  awarded: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  not_awarded: "bg-gray-500/20 text-gray-400 border-gray-500/40",
  archived: "bg-muted/40 text-muted-foreground border-border",
};

function statusLabel(s: string | null) {
  if (!s) return "Setup";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function MissionHeader({
  mission,
}: {
  mission: Mission;
  unreadCount?: number;
}) {
  const deadline = mission.submission_deadline
    ? new Date(mission.submission_deadline)
    : null;
  const daysLeft = deadline ? differenceInCalendarDays(deadline, new Date()) : null;

  const countdownColor =
    daysLeft === null
      ? "text-muted-foreground"
      : daysLeft < 14
      ? "text-red-400"
      : daysLeft < 30
      ? "text-amber-400"
      : "text-foreground";

  const statusKey = (mission.status ?? "setup").toLowerCase();
  const statusClass = STATUS_STYLES[statusKey] ?? STATUS_STYLES.setup;

  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="border-b border-border bg-surface/40 backdrop-blur">
      <MissionEditPanel missionId={mission.id} open={editOpen} onOpenChange={setEditOpen} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl sm:text-3xl font-bold text-foreground">
                {mission.name}
              </h1>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Edit mission"
                title="Edit mission"
                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
                  statusClass,
                )}
              >
                {statusLabel(mission.status)}
              </span>
            </div>
            {mission.client_name && (
              <p className="mt-1 text-sm text-muted-foreground truncate">
                {mission.client_name}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              {daysLeft !== null ? (
                <>
                  <div className={cn("text-lg font-semibold", countdownColor)}>
                    {daysLeft < 0
                      ? `${Math.abs(daysLeft)} days past`
                      : `${daysLeft} days to submission`}
                  </div>
                  {deadline && (
                    <div className="text-xs text-muted-foreground">
                      {format(deadline, "MMM d, yyyy")}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No deadline set</div>
              )}
            </div>
            <IntelligenceCompletenessChip missionId={mission.id} />
            <Link
              to="/olympus/flight-deck"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--athena-gold)]/40 bg-[var(--athena-gold)]/10 px-3 py-1.5 text-xs font-medium text-[var(--athena-gold)] hover:bg-[var(--athena-gold)]/20 transition-colors"
            >
              <Plane className="h-3.5 w-3.5" />
              Flight Deck
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
