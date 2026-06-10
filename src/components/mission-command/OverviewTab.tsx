import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { differenceInCalendarDays, format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TabId } from "./MissionTabs";

export function OverviewTab({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["mission-overview", missionId],
    queryFn: async () => {
      const [
        mission,
        questions,
        team,
        assignments,
        phases,
        deliverables,
        winStrategy,
        audit,
        notifications,
      ] = await Promise.all([
        supabase
          .from("missions")
          .select("id, name, submission_deadline, blast_off_at")
          .eq("id", missionId)
          .single(),
        supabase
          .from("mission_questions")
          .select("id, status, health_status, is_withdrawn, due_date, question_number, section_id")
          .eq("mission_id", missionId),
        supabase
          .from("mission_team_members")
          .select(
            "id, member:atlas_team_members(id, first_name, last_name, atlas_invite_status)",
          )
          .eq("mission_id", missionId),
        supabase
          .from("mission_assignments")
          .select(
            "id, question_id, assigned_writer_id, acceptance_status, assigned_at",
          )
          .eq("mission_id", missionId),
        supabase
          .from("mission_journey_phases")
          .select("id, name, color, start_date, end_date, order_index, kind")
          .eq("mission_id", missionId)
          .order("order_index"),
        supabase
          .from("mission_journey_deliverables")
          .select("id, title, due_date, status")
          .eq("mission_id", missionId)
          .neq("status", "complete")
          .order("due_date", { ascending: true }),
        supabase
          .from("mission_win_strategy")
          .select("north_star_message, central_claim")
          .eq("mission_id", missionId)
          .maybeSingle(),
        supabase
          .from("mission_audit_log")
          .select("id, action, performed_by_name, created_at")
          .eq("mission_id", missionId)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("atlas_notifications")
          .select("id")
          .eq("type", "iris_alert")
          .eq("is_read", false),
      ]);

      return {
        mission: mission.data,
        questions: questions.data ?? [],
        team: team.data ?? [],
        assignments: assignments.data ?? [],
        phases: phases.data ?? [],
        deliverables: deliverables.data ?? [],
        winStrategy: winStrategy.data,
        audit: audit.data ?? [],
        unreadAlerts: notifications.data?.length ?? 0,
      };
    },
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-24" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const questions = data.questions.filter((q) => !q.is_withdrawn);
  const assignedQs = data.assignments.length;
  const completeQs = questions.filter((q) => q.status === "complete").length;
  const atRiskQs = questions.filter((q) => q.health_status === "at_risk");
  const healthy = questions.filter((q) => q.health_status === "healthy").length;
  const watch = questions.filter((q) => q.health_status === "watch").length;
  const totalQ = questions.length;
  const pct = totalQ > 0 ? Math.round((completeQs / totalQ) * 100) : 0;

  const inviteActive = data.team.filter(
    (t) => (t.member as any)?.atlas_invite_status === "accepted",
  ).length;
  const invitePending = data.team.filter(
    (t) => (t.member as any)?.atlas_invite_status === "sent",
  ).length;
  const inviteNone = data.team.filter(
    (t) =>
      !(t.member as any)?.atlas_invite_status ||
      (t.member as any)?.atlas_invite_status === "not_invited",
  ).length;

  const now = new Date();
  const deadline = data.mission?.submission_deadline
    ? new Date(data.mission.submission_deadline)
    : null;
  const daysToDeadline = deadline ? differenceInCalendarDays(deadline, now) : null;
  const nextDeliverable = data.deliverables[0];
  const currentPhase = data.phases.find((p) => {
    if (!p.start_date || !p.end_date) return false;
    const s = new Date(p.start_date);
    const e = new Date(p.end_date);
    return s <= now && now <= e;
  });
  const daysSinceLaunch = data.mission?.blast_off_at
    ? differenceInCalendarDays(now, new Date(data.mission.blast_off_at))
    : null;

  const pendingAcceptances = data.assignments.filter(
    (a) =>
      a.acceptance_status === "pending" &&
      a.assigned_at &&
      differenceInCalendarDays(now, new Date(a.assigned_at)) >= 1,
  );

  const writerNameMap = new Map<string, string>();
  data.team.forEach((t) => {
    const m = t.member as any;
    if (m?.id) writerNameMap.set(m.id, `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim());
  });

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Questions"
          value={totalQ.toString()}
          sub={
            <span>
              Assigned {assignedQs} · Complete {completeQs} ·{" "}
              <span className={atRiskQs.length > 0 ? "text-red-400" : ""}>
                At Risk {atRiskQs.length}
              </span>
            </span>
          }
        />
        <StatCard
          title="Team"
          value={data.team.length.toString()}
          sub={`Active ${inviteActive} · Invite Pending ${invitePending} · Not Invited ${inviteNone}`}
        />
        <StatCard
          title="Progress"
          value={`${pct}%`}
          accessory={<ProgressRing pct={pct} />}
          sub="Overall completion"
        />
        <StatCard
          title="Health"
          value={
            <div className="flex gap-3 text-xl font-semibold">
              <span className="text-green-400">{healthy}</span>
              <span className="text-amber-400">{watch}</span>
              <span className="text-red-400">{atRiskQs.length}</span>
            </div>
          }
          sub="Question health"
        />
      </div>

      {/* Key dates */}
      <div className="rounded-xl border border-border bg-surface/40 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KeyDate
            label="Submission Deadline"
            value={deadline ? format(deadline, "MMMM d, yyyy") : "Not set"}
            sub={daysToDeadline !== null ? `${daysToDeadline} days remaining` : ""}
          />
          <KeyDate
            label="Next Deliverable Due"
            value={
              nextDeliverable?.due_date
                ? format(new Date(nextDeliverable.due_date), "MMM d, yyyy")
                : "None scheduled"
            }
            sub={nextDeliverable?.title ?? ""}
          />
          <KeyDate
            label="Current Phase"
            value={currentPhase?.name ?? "Between phases"}
            sub=""
          />
          <KeyDate
            label="Days Since Launch"
            value={daysSinceLaunch === null ? "Not yet launched" : `${daysSinceLaunch} days`}
            sub=""
          />
        </div>
      </div>

      {/* Win Strategy */}
      <div className="rounded-xl border border-border border-l-4 border-l-primary bg-surface/60 p-6">
        {data.winStrategy?.north_star_message ? (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              North Star
            </div>
            <p className="mt-2 text-xl italic text-foreground">
              {data.winStrategy.north_star_message}
            </p>
            {data.winStrategy.central_claim && (
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">Central Claim: </span>
                <span className="text-foreground">{data.winStrategy.central_claim}</span>
              </p>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            Win Strategy not yet configured.{" "}
            <button
              onClick={() => onNavigateTab("win-strategy")}
              className="text-primary hover:underline"
            >
              Open Win Strategy
            </button>
          </div>
        )}
      </div>

      {/* Mini Journey */}
      <div className="rounded-xl border border-border bg-surface/40 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Journey
        </div>
        {data.phases.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Journey not yet configured.{" "}
            <button
              onClick={() => onNavigateTab("journey")}
              className="text-primary hover:underline"
            >
              Open Journey
            </button>
          </div>
        ) : (
          <MiniJourney
            phases={data.phases as any}
            currentPhaseId={currentPhase?.id}
            onClick={() => onNavigateTab("journey")}
          />
        )}
      </div>

      {/* Needs Attention */}
      <div className="rounded-xl border border-border bg-surface/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-semibold text-foreground">Needs Attention</h3>
          <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs text-muted-foreground">
            {atRiskQs.length + pendingAcceptances.length + data.unreadAlerts}
          </span>
        </div>

        <div className="space-y-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
              At Risk Questions
            </div>
            {atRiskQs.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="h-4 w-4" /> No at-risk questions. Good shape.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {atRiskQs.slice(0, 8).map((q) => {
                  const assignment = data.assignments.find((a) => a.question_id === q.id);
                  const writer = assignment?.assigned_writer_id
                    ? writerNameMap.get(assignment.assigned_writer_id)
                    : null;
                  const due = q.due_date ? new Date(q.due_date) : null;
                  const daysToDue = due ? differenceInCalendarDays(due, now) : null;
                  return (
                    <li
                      key={q.id}
                      className="flex flex-wrap items-center gap-3 rounded-md bg-surface px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-primary text-xs">
                        {q.question_number}
                      </span>
                      <span className="text-muted-foreground">{writer ?? "Unassigned"}</span>
                      {due && (
                        <span className="text-muted-foreground">
                          {format(due, "MMM d")}
                          {daysToDue !== null && ` · ${daysToDue}d`}
                        </span>
                      )}
                      <button
                        onClick={() => onNavigateTab("sections-questions")}
                        className="ml-auto text-xs text-primary hover:underline"
                      >
                        View Question
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {pendingAcceptances.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                Pending Acceptances
              </div>
              <ul className="space-y-1.5">
                {pendingAcceptances.map((a) => {
                  const q = data.questions.find((qq) => qq.id === a.question_id);
                  const writer = a.assigned_writer_id
                    ? writerNameMap.get(a.assigned_writer_id)
                    : null;
                  const days = a.assigned_at
                    ? differenceInCalendarDays(now, new Date(a.assigned_at))
                    : 0;
                  return (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-3 rounded-md bg-surface px-3 py-2 text-sm"
                    >
                      <span className="font-mono text-primary text-xs">
                        {q?.question_number ?? "—"}
                      </span>
                      <span className="text-muted-foreground">{writer ?? "Unknown"}</span>
                      <span className="text-amber-400">{days}d pending</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {data.unreadAlerts > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>{data.unreadAlerts} unread IRIS alerts</span>
              <button className="text-primary hover:underline ml-auto text-xs">
                View alerts
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-xl border border-border bg-surface/40 p-5">
        <h3 className="font-semibold text-foreground mb-3">Recent Activity</h3>
        {data.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="text-foreground">{a.action}</span>
                {a.performed_by_name && (
                  <span className="text-muted-foreground">— {a.performed_by_name}</span>
                )}
                {a.created_at && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  accessory,
}: {
  title: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  accessory?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          <div className="mt-1 text-3xl font-bold text-foreground">{value}</div>
        </div>
        {accessory}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} stroke="var(--surface-hover)" strokeWidth="5" fill="none" />
      <circle
        cx="28"
        cy="28"
        r={r}
        stroke="var(--primary)"
        strokeWidth="5"
        fill="none"
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        transform="rotate(-90 28 28)"
      />
    </svg>
  );
}

function KeyDate({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function MiniJourney({
  phases,
  currentPhaseId,
  onClick,
}: {
  phases: { id: string; name: string; color: string | null; start_date: string | null; end_date: string | null }[];
  currentPhaseId?: string;
  onClick: () => void;
}) {
  const sorted = phases.filter((p) => p.start_date && p.end_date);
  if (sorted.length === 0) return null;
  const start = Math.min(...sorted.map((p) => new Date(p.start_date!).getTime()));
  const end = Math.max(...sorted.map((p) => new Date(p.end_date!).getTime()));
  const total = end - start || 1;
  const todayPct = Math.max(0, Math.min(100, ((Date.now() - start) / total) * 100));

  return (
    <div className="relative h-[60px] w-full" onClick={onClick} role="button" tabIndex={0}>
      <div className="absolute inset-0 flex rounded-md overflow-hidden bg-surface-hover">
        {sorted.map((p) => {
          const s = new Date(p.start_date!).getTime();
          const e = new Date(p.end_date!).getTime();
          const widthPct = ((e - s) / total) * 100;
          const isCurrent = p.id === currentPhaseId;
          return (
            <div
              key={p.id}
              className={cn(
                "h-full flex items-center justify-center text-[10px] px-1 truncate border-r border-background last:border-r-0",
                isCurrent && "ring-2 ring-primary ring-inset",
              )}
              style={{
                width: `${widthPct}%`,
                backgroundColor: p.color ?? "var(--surface-deep)",
                color: "white",
              }}
              title={p.name}
            >
              {p.name}
            </div>
          );
        })}
      </div>
      {todayPct >= 0 && todayPct <= 100 && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary"
          style={{ left: `${todayPct}%` }}
        />
      )}
    </div>
  );
}
