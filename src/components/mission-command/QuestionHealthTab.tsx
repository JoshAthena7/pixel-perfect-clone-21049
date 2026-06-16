import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import {
  AlertTriangle,
  Eye,
  Loader2,
  CheckCircle2,
  RefreshCw,
  Flag,
  MessageSquare,
  Clipboard,
  ShieldAlert,
  Lock,
  Bookmark,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SkeletonRows, ErrorState, EmptyState } from "@/components/shared/data-states";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { runHealthCalculation } from "@/lib/health-calc";
import { listQuestionLatestScores } from "@/lib/v2-home.functions";
import {
  listMissionFlags,
  createManagerFlag,
  resolveManagerFlag,
  applyHealthOverride,
  getLatestOverride,
  saveAdminNote,
} from "@/lib/health-controls.functions";
import { useIsAdmin, useMissionAccess } from "@/hooks/useAccess";
import { ThreadPanel } from "@/components/flight-deck/ThreadPanel";
import { cn } from "@/lib/utils";
import type { TabId } from "./MissionTabs";


type Question = {
  id: string;
  section_id: string;
  question_number: string;
  question_text: string;
  due_date: string | null;
  status: string | null;
  health_status: string | null;
  health_calculated_at: string | null;
  is_withdrawn: boolean | null;
  evaluation_criteria: string | null;
  updated_at: string | null;
};
type Section = { id: string; name: string };
type Assignment = {
  id: string;
  question_id: string;
  assigned_writer_id: string | null;
  acceptance_status: string | null;
  writer_confidence: string | null;
};
type TeamMember = {
  id: string;
  mission_role: string | null;
  member: { id: string; first_name: string | null; last_name: string | null } | null;
};

export function QuestionHealthTab({
  missionId,
  onNavigateTab,
}: {
  missionId: string;
  onNavigateTab: (t: TabId) => void;
}) {
  const qc = useQueryClient();
  const [recalculating, setRecalculating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [healthFilter, setHealthFilter] = useState<"all" | "healthy" | "watch" | "at_risk">("all");
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [writerFilter, setWriterFilter] = useState<string>("all");
  const [dueFrom, setDueFrom] = useState<Date | undefined>();
  const [dueTo, setDueTo] = useState<Date | undefined>();
  const [sortBy, setSortBy] = useState<"health" | "due" | "activity" | "writer">("health");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Role gating: platform admin vs mission manager (EL / PM / lead) vs writer.
  const { isAdmin } = useIsAdmin();
  const { data: missionAccess } = useMissionAccess(missionId);
  const role = (missionAccess?.role ?? "").toLowerCase();
  const isPmOrEL =
    role === "engagement_lead" || role === "project_manager" || role === "lead" || role === "lead_writer";
  const isManager = !isAdmin && isPmOrEL;
  const canManage = isAdmin || isPmOrEL; // sees manager-only controls

  // "My Watch List" toggle, persisted per mission per user.
  const watchKey = `atlas:watchlist:${missionId}`;
  const [watchOnly, setWatchOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(watchKey) === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(watchKey, watchOnly ? "1" : "0");
  }, [watchOnly, watchKey]);

  // Open Thread panel state (reuses flight-deck ThreadPanel).
  const [threadFor, setThreadFor] = useState<{
    questionId: string;
    questionNumber: string;
    questionText: string;
  } | null>(null);

  // Manager flags (visible to all members; only managers/admin can write).
  const listFlagsFn = useServerFn(listMissionFlags);
  const { data: flagsData, refetch: refetchFlags } = useQuery({
    queryKey: ["mission-manager-flags", missionId],
    queryFn: () => listFlagsFn({ data: { missionId } }),
    staleTime: 30_000,
  });
  const activeFlagByQ = useMemo(() => {
    const m = new Map<string, { id: string; reason: string | null; flaggedBy: string }>();
    for (const f of (flagsData?.flags ?? []) as any[]) {
      if (f.resolved) continue;
      if (!m.has(f.question_id)) {
        m.set(f.question_id, { id: f.id, reason: f.flag_reason, flaggedBy: f.flagged_by });
      }
    }
    return m;
  }, [flagsData]);

  // Admin override history (admin-only via RLS).
  const getOverridesFn = useServerFn(getLatestOverride);
  const { data: overridesData, refetch: refetchOverrides } = useQuery({
    queryKey: ["mission-health-overrides", missionId, isAdmin],
    queryFn: () => getOverridesFn({ data: { missionId } }),
    enabled: isAdmin,
    staleTime: 30_000,
  });
  const latestOverrideByQ = useMemo(() => {
    const m = new Map<string, any>();
    for (const o of (overridesData?.overrides ?? []) as any[]) {
      if (!m.has(o.question_id)) m.set(o.question_id, o);
    }
    return m;
  }, [overridesData]);


  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["question-health", missionId],
    queryFn: async () => {
      const [qs, secs, asgs, team, smes, flags] = await Promise.all([
        supabase.from("mission_questions").select("*").eq("mission_id", missionId),
        supabase.from("mission_sections").select("id, name").eq("mission_id", missionId),
        supabase.from("mission_assignments").select("*").eq("mission_id", missionId),
        supabase
          .from("mission_team_members")
          .select("id, mission_role, member:atlas_team_members(id, first_name, last_name)")
          .eq("mission_id", missionId),
        supabase.from("mission_assignment_smes").select("assignment_id, sme_member_id"),
        supabase
          .from("iris_health_flags")
          .select("*")
          .eq("mission_id", missionId)
          .is("resolved_at", null),
      ]);
      return {
        questions: ((qs.data ?? []) as Question[]).filter((q) => !q.is_withdrawn),
        sections: (secs.data ?? []) as Section[],
        assignments: (asgs.data ?? []) as Assignment[],
        team: (team.data ?? []) as TeamMember[],
        smes: (smes.data ?? []) as { assignment_id: string; sme_member_id: string }[],
        flags: (flags.data ?? []) as any[],
      };
    },
  });

  // Per-question latest scores (last 7 days). RLS filters: writers see only
  // their own; admins/engagement leads see all scores for the mission.
  const listScores = useServerFn(listQuestionLatestScores);
  const { data: latestScores } = useQuery({
    queryKey: ["question-latest-scores", missionId],
    queryFn: () => listScores({ data: { missionId, scope: "all" } }),
    staleTime: 60_000,
  });
  const scoreMap = latestScores?.latest ?? {};

  // Run health calc on mount, then every 30 minutes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setRecalculating(true);
      try {
        await runHealthCalculation(missionId);
      } catch (e) {
        console.error("health calc failed", e);
      } finally {
        if (!cancelled) {
          setRecalculating(false);
          setLastUpdated(new Date());
          qc.invalidateQueries({ queryKey: ["question-health", missionId] });
        }
      }
    };
    run();
    const interval = setInterval(run, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [missionId, qc]);

  const writerName = (id: string | null) => {
    if (!id || !data) return null;
    const m = data.team.find((t) => t.member?.id === id)?.member;
    if (!m) return null;
    return `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  };

  const writers = useMemo(
    () => (data?.team ?? []).filter((t) => t.member?.id),
    [data],
  );

  const counts = useMemo(() => {
    const c = { healthy: 0, watch: 0, at_risk: 0 };
    (data?.questions ?? []).forEach((q) => {
      if (q.health_status === "healthy") c.healthy++;
      else if (q.health_status === "watch") c.watch++;
      else if (q.health_status === "at_risk") c.at_risk++;
    });
    return c;
  }, [data]);

  const filtersActive =
    healthFilter !== "all" ||
    sectionFilter !== "all" ||
    writerFilter !== "all" ||
    dueFrom ||
    dueTo;

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.questions.filter((q) => {
      if (healthFilter !== "all" && q.health_status !== healthFilter) return false;
      if (sectionFilter !== "all" && q.section_id !== sectionFilter) return false;
      const a = data.assignments.find((x) => x.question_id === q.id);
      if (writerFilter !== "all" && a?.assigned_writer_id !== writerFilter) return false;
      if (dueFrom && (!q.due_date || new Date(q.due_date) < dueFrom)) return false;
      if (dueTo && (!q.due_date || new Date(q.due_date) > dueTo)) return false;
      return true;
    });
  }, [data, healthFilter, sectionFilter, writerFilter, dueFrom, dueTo]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const healthRank = (h: string | null) =>
      h === "at_risk" ? 0 : h === "watch" ? 1 : h === "healthy" ? 2 : 3;
    const dueRank = (d: string | null) => (d ? new Date(d).getTime() : Infinity);
    arr.sort((a, b) => {
      if (sortBy === "due") return dueRank(a.due_date) - dueRank(b.due_date);
      if (sortBy === "activity") {
        const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bt - at;
      }
      if (sortBy === "writer") {
        const aw =
          writerName(data?.assignments.find((x) => x.question_id === a.id)?.assigned_writer_id ?? null) ?? "";
        const bw =
          writerName(data?.assignments.find((x) => x.question_id === b.id)?.assigned_writer_id ?? null) ?? "";
        return aw.localeCompare(bw);
      }
      // default: health then due
      const hd = healthRank(a.health_status) - healthRank(b.health_status);
      if (hd !== 0) return hd;
      return dueRank(a.due_date) - dueRank(b.due_date);
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortBy, data]);

  const clearFilters = () => {
    setHealthFilter("all");
    setSectionFilter("all");
    setWriterFilter("all");
    setDueFrom(undefined);
    setDueTo(undefined);
  };

  if (isError) return <ErrorState message="Couldn't load question health." onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return <SkeletonRows rows={5} height="h-28" />;
  }

  if (data.questions.length === 0) {
    return (
      <EmptyState
        title="No questions yet"
        description="Add sections and questions to begin tracking question health."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid grid-cols-3 gap-3 flex-1 min-w-[280px]">
          <StatCard
            label="Healthy"
            value={counts.healthy}
            active={healthFilter === "healthy"}
            color="green"
            onClick={() => setHealthFilter(healthFilter === "healthy" ? "all" : "healthy")}
          />
          <StatCard
            label="Watch"
            value={counts.watch}
            active={healthFilter === "watch"}
            color="amber"
            onClick={() => setHealthFilter(healthFilter === "watch" ? "all" : "watch")}
          />
          <StatCard
            label="At Risk"
            value={counts.at_risk}
            active={healthFilter === "at_risk"}
            color="red"
            onClick={() => setHealthFilter(healthFilter === "at_risk" ? "all" : "at_risk")}
          />
        </div>
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2 shrink-0">
          {recalculating ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Recalculating health…
            </>
          ) : lastUpdated ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-green-400" /> Health updated{" "}
              {format(lastUpdated, "h:mm a")}
              <button
                className="ml-2 inline-flex items-center gap-1 text-primary hover:underline"
                onClick={async () => {
                  setRecalculating(true);
                  await runHealthCalculation(missionId);
                  setRecalculating(false);
                  setLastUpdated(new Date());
                  qc.invalidateQueries({ queryKey: ["question-health", missionId] });
                }}
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-border bg-surface/40 p-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-0 border border-border rounded-md overflow-hidden">
          {(["all", "healthy", "watch", "at_risk"] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHealthFilter(h)}
              className={cn(
                "px-3 py-1.5 text-xs border-b-2",
                healthFilter === h
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {h === "all" ? "All" : h === "at_risk" ? "At Risk" : h.charAt(0).toUpperCase() + h.slice(1)}
            </button>
          ))}
        </div>
        <Select value={sectionFilter} onValueChange={setSectionFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {data.sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={writerFilter} onValueChange={setWriterFilter}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Writer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All writers</SelectItem>
            {writers.map((w) => (
              <SelectItem key={w.id} value={w.member?.id ?? w.id}>
                {writerName(w.member?.id ?? null) ?? "Unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DueDatePicker label="From" value={dueFrom} onChange={setDueFrom} />
        <DueDatePicker label="To" value={dueTo} onChange={setDueTo} />
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="health">Sort: Health</SelectItem>
            <SelectItem value="due">Sort: Due Date</SelectItem>
            <SelectItem value="activity">Sort: Last Activity</SelectItem>
            <SelectItem value="writer">Sort: Writer</SelectItem>
          </SelectContent>
        </Select>
        {filtersActive && (
          <button onClick={clearFilters} className="text-xs text-primary hover:underline">
            Clear all filters
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No questions match your filters.{" "}
          <button onClick={clearFilters} className="text-primary hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((q) => {
            const a = data.assignments.find((x) => x.question_id === q.id);
            const section = data.sections.find((s) => s.id === q.section_id);
            const flag = data.flags.find((f) => f.question_id === q.id);
            const expanded = expandedId === q.id;
            const smesForQ = a
              ? data.smes
                  .filter((s) => s.assignment_id === a.id)
                  .map((s) => writerName(s.sme_member_id) ?? "Unknown")
              : [];
            return (
              <HealthCard
                key={q.id}
                q={q}
                a={a}
                section={section}
                writerLabel={writerName(a?.assigned_writer_id ?? null)}
                expanded={expanded}
                onToggle={() => setExpandedId(expanded ? null : q.id)}
                onGoToSection={() => onNavigateTab("work")}
                flag={flag}
                smes={smesForQ}
                latestScore={scoreMap[q.id]?.score}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  active,
  color,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  color: "green" | "amber" | "red";
  onClick: () => void;
}) {
  const palette = {
    green: "bg-green-500/15 border-green-500/40 text-green-400",
    amber: "bg-amber-500/15 border-amber-500/40 text-amber-400",
    red: "bg-red-500/15 border-red-500/40 text-red-400",
  }[color];
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border p-4 text-left transition-all",
        palette,
        active && "ring-2 ring-offset-2 ring-offset-background ring-primary",
      )}
    >
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wide mt-1">{label}</div>
    </button>
  );
}

function DueDatePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          {label}: {value ? format(value, "MMM d") : "Any"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

function HealthCard({
  q,
  a,
  section,
  writerLabel,
  expanded,
  onToggle,
  onGoToSection,
  flag,
  smes,
  latestScore,
}: {
  q: Question;
  a?: Assignment;
  section?: Section;
  writerLabel: string | null;
  expanded: boolean;
  onToggle: () => void;
  onGoToSection: () => void;
  flag?: any;
  smes: string[];
  latestScore?: number;
}) {
  const h = q.health_status ?? "healthy";
  const borderColor =
    h === "at_risk" ? "border-l-red-500" : h === "watch" ? "border-l-amber-500" : "border-l-green-500";
  const due = q.due_date ? new Date(q.due_date) : null;
  const days = due ? differenceInDays(due, new Date()) : null;
  const dueColor =
    days === null
      ? "text-muted-foreground"
      : days < 7
      ? "text-red-400"
      : days < 14
      ? "text-amber-400"
      : "text-green-400";

  const text = q.question_text ?? "";
  const truncated = text.length > 140 ? text.slice(0, 140) + "…" : text;

  return (
    <div
      className={cn("rounded-xl border border-border border-l-4 bg-surface/40 p-4 cursor-pointer", borderColor)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-no-toggle]")) return;
        onToggle();
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <HealthBadge value={h} />
        <span className="font-mono text-primary">{q.question_number}</span>
        <span className="text-muted-foreground">{section?.name ?? "—"}</span>
        {typeof latestScore === "number" && <ScorePill score={latestScore} />}
        <span className={cn("ml-auto", dueColor)}>
          {due
            ? `${format(due, "MMM d, yyyy")} · ${days !== null && days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}`
            : "No due date"}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">{expanded ? text : truncated}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-foreground">{writerLabel ?? "Unassigned"}</span>
        {a?.acceptance_status && <AcceptanceBadge value={a.acceptance_status} />}
        <ConfidenceBadge value={a?.writer_confidence ?? null} />
        {q.updated_at && (
          <span className="ml-auto text-muted-foreground">
            Last updated {formatDistanceToNow(new Date(q.updated_at), { addSuffix: true })}
          </span>
        )}
      </div>
      {flag && (
        <div className="mt-2 flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded p-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{flag.flag_text ?? flag.reason ?? "IRIS has flagged this question."}</span>
        </div>
      )}
      {expanded && (
        <div className="mt-3 border-t border-border pt-3 space-y-3 text-sm">
          <div>
            <div className="text-xs uppercase text-muted-foreground mb-1">Assigned SMEs</div>
            <div>{smes.length ? smes.join(", ") : <span className="text-muted-foreground">None</span>}</div>
          </div>
          {q.evaluation_criteria && (
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1">Evaluation Criteria</div>
              <p>{q.evaluation_criteria}</p>
            </div>
          )}
          <div className="flex items-center gap-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Days until due</div>
              <div className={cn("text-3xl font-bold", dueColor)}>
                {days === null ? "—" : days < 0 ? `${Math.abs(days)} overdue` : days}
              </div>
            </div>
            <div className="ml-auto flex gap-2" data-no-toggle>
              <Button size="sm" variant="outline" onClick={onGoToSection}>
                Reassign Writer
              </Button>
              <Button size="sm" variant="outline" onClick={onGoToSection}>
                Change Due Date
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="mt-2 text-right" data-no-toggle>
        <button
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          onClick={onGoToSection}
        >
          View in Sections & Questions <Eye className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function HealthBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    healthy: "bg-green-500/20 text-green-400",
    watch: "bg-amber-500/20 text-amber-400",
    at_risk: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded uppercase font-semibold", map[value] ?? "bg-muted")}>
      {value.replace("_", " ")}
    </span>
  );
}
function AcceptanceBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400",
    accepted: "bg-green-500/20 text-green-400",
    need_help: "bg-blue-500/20 text-blue-400",
    capacity_concern: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded uppercase", map[value] ?? "bg-muted")}>
      {value.replace(/_/g, " ")}
    </span>
  );
}
function ConfidenceBadge({ value }: { value: string | null }) {
  const v = value ?? "not_set";
  const label = v === "not_set" ? "Confidence: Not Set" : `Confidence: ${v}`;
  const map: Record<string, string> = {
    high: "bg-green-500/20 text-green-400",
    medium: "bg-amber-500/20 text-amber-400",
    low: "bg-red-500/20 text-red-400",
    not_set: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded uppercase", map[v] ?? "bg-muted")}>
      {label}
    </span>
  );
}

function ScorePill({ score }: { score: number }) {
  const color =
    score >= 90 ? "#C49A2B" : score >= 75 ? "#7dcf7d" : score >= 60 ? "#EF9F27" : "#f08080";
  return (
    <span
      title={`Latest draft score: ${score}/100`}
      className="rounded-full px-1.5 py-0.5 font-semibold tabular-nums"
      style={{
        background: `${color}22`,
        color,
        fontSize: 10,
        border: `0.5px solid ${color}66`,
      }}
    >
      {score}
    </span>
  );
}
