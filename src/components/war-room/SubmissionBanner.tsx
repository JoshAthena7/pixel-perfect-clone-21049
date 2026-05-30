import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEngagement } from "@/hooks/use-engagement";
import { daysUntil } from "@/lib/time";
import { cn } from "@/lib/utils";

type Milestone = {
  id: string;
  label: string;
  due_date: string;
  completed_at: string | null;
  sort_order: number;
};

export function SubmissionBanner() {
  const { engagement } = useEngagement();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [openRisksCount, setOpenRisksCount] = useState(0);
  const [openSosCount, setOpenSosCount] = useState(0);

  useEffect(() => {
    if (!engagement) return;
    let cancelled = false;
    async function load(eid: string) {
      const [milestonesRes, risksRes, sosRes] = await Promise.all([
        supabase
          .from("engagement_milestones")
          .select("*")
          .eq("engagement_id", eid)
          .order("due_date"),
        supabase
          .from("risks")
          .select("id", { count: "exact", head: true })
          .eq("engagement_id", eid)
          .neq("status", "Closed"),
        supabase
          .from("sos_alerts")
          .select("id", { count: "exact", head: true })
          .eq("engagement_id", eid)
          .neq("status", "Resolved"),
      ]);
      if (cancelled) return;
      setMilestones((milestonesRes.data as Milestone[]) ?? []);
      setOpenRisksCount(risksRes.count ?? 0);
      setOpenSosCount(sosRes.count ?? 0);
    }
    load(engagement.id);
    const ch = supabase
      .channel(`milestones:${engagement.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "engagement_milestones", filter: `engagement_id=eq.${engagement.id}` },
        () => load(engagement.id),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "risks", filter: `engagement_id=eq.${engagement.id}` },
        () => load(engagement.id),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sos_alerts", filter: `engagement_id=eq.${engagement.id}` },
        () => load(engagement.id),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [engagement?.id]);


  if (!engagement?.submission_date) return null;
  const dleft = daysUntil(engagement.submission_date);
  if (dleft === null) return null;

  const tone =
    dleft < 0
      ? "past"
      : dleft <= 3
        ? "critical"
        : dleft <= 14
          ? "warning"
          : "normal";

  const toneClasses = {
    past: "border-zinc-700 bg-zinc-900/60",
    critical: "border-[color:var(--red)]/60 bg-[color:var(--red)]/10",
    warning: "border-amber-500/50 bg-amber-500/10",
    normal: "border-border bg-surface/60",
  }[tone];

  const label =
    dleft > 0
      ? `T-minus ${dleft} ${dleft === 1 ? "day" : "days"}`
      : dleft === 0
        ? "Submission today"
        : `${Math.abs(dleft)}d past submission`;

  const archived = engagement.status === "Archived" || engagement.status === "Complete";
  const overdueActive = (tone === "past" || tone === "critical") && !archived;
  const overdueLabel = dleft !== null && dleft < 0 && !archived
    ? "SUBMISSION OVERDUE"
    : label;

  return (
    <div className={cn("border-b backdrop-blur px-3 py-2", toneClasses)}>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider">
          {tone === "critical" || tone === "past" ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <Clock className="h-3.5 w-3.5" />
          )}
          {overdueLabel}
        </div>

        <span className="text-muted-foreground">
          Submission{" "}
          {new Date(engagement.submission_date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </span>

        {milestones.length > 0 && (
          <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden">
            {milestones.map((m) => {
              const done = !!m.completed_at;
              const md = daysUntil(m.due_date);
              const overdue = !done && md !== null && md < 0;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-center gap-1.5",
                    done
                      ? "text-muted-foreground line-through"
                      : overdue
                        ? "text-[color:var(--red)] font-medium"
                        : "text-foreground",
                  )}
                  title={m.due_date}
                >
                  {done ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Circle className="h-3 w-3" />
                  )}
                  <span>{m.label}</span>
                  {!done && md !== null && (
                    <span className="text-[10px] text-muted-foreground">
                      ({md > 0 ? `${md}d` : md === 0 ? "today" : `${Math.abs(md)}d late`})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Link to="/settings" className="ml-auto text-muted-foreground hover:text-foreground underline">
          {milestones.length === 0 ? "Add milestones" : "Edit"}
        </Link>
      </div>
      {overdueActive && (openRisksCount > 0 || openSosCount > 0) && (
        <div className="mx-auto mt-1 max-w-7xl text-[11px] font-medium text-[color:var(--red)]">
          {openRisksCount > 0 && (
            <>
              {openRisksCount} open risk{openRisksCount === 1 ? "" : "s"}
            </>
          )}
          {openRisksCount > 0 && openSosCount > 0 && " and "}
          {openSosCount > 0 && (
            <>
              {openSosCount} unresolved SOS alert{openSosCount === 1 ? "" : "s"}
            </>
          )}
          {" remain."}
        </div>
      )}
    </div>
  );

}
