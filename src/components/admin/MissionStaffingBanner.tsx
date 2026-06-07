import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Users, ShieldAlert, Layers, RefreshCw, Sparkles } from "lucide-react";
import { getMissionStaffingSummary, refreshMissionStaffingSummary } from "@/lib/mission-staffing.functions";
import { toast } from "sonner";
import { useState } from "react";

type Totals = {
  total_questions: number;
  unassigned_writer: number;
  unassigned_lead_sme: number;
  unassigned_strategic_owner: number;
  red_health: number;
  yellow_health: number;
  green_health: number;
};

type SummaryRow = {
  mission_id: string;
  unassigned_questions: any[];
  overloaded_writers: any[];
  sections_without_owner: any[];
  high_risk_areas: any[];
  totals: Totals;
  generated_at: string;
};

export function MissionStaffingBanner({ missionId }: { missionId: string }) {
  const getFn = useServerFn(getMissionStaffingSummary);
  const refreshFn = useServerFn(refreshMissionStaffingSummary);
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["mission-staffing-summary", missionId],
    queryFn: () => getFn({ data: { missionId } }),
  });

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refreshFn({ data: { missionId } });
      await refetch();
      toast.success("Staffing summary refreshed.");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to refresh staffing summary.");
    } finally {
      setRefreshing(false);
    }
  }

  if (isLoading) return null;
  const summary = data as SummaryRow | null;
  if (!summary) {
    return (
      <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>
              No IRIS staffing summary yet. Upload an Assignment Matrix or refresh to generate one.
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] hover:bg-surface-hover disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Generate
          </button>
        </div>
      </div>
    );
  }

  const t = summary.totals;
  const totalUnassigned = t.unassigned_writer + t.unassigned_lead_sme + t.unassigned_strategic_owner;
  const tone =
    t.red_health > 0 || totalUnassigned > t.total_questions * 0.5
      ? { ring: "ring-destructive/30", bg: "from-destructive/10", icon: "text-destructive" }
      : totalUnassigned > 0 || t.yellow_health > 0
        ? { ring: "ring-amber-500/30", bg: "from-amber-500/10", icon: "text-amber-400" }
        : { ring: "ring-emerald-500/30", bg: "from-emerald-500/10", icon: "text-emerald-400" };

  return (
    <section
      className={`rounded-xl border border-border bg-gradient-to-br ${tone.bg} to-transparent p-5 ring-1 ${tone.ring}`}
      aria-label="IRIS staffing summary"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <Sparkles className={`h-3 w-3 ${tone.icon}`} />
            IRIS Mission Staffing Summary
          </div>
          <h3 className="mt-1 text-base font-semibold">
            {t.total_questions} questions · {t.red_health + t.yellow_health} need attention
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Generated {new Date(summary.generated_at).toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface/70 px-2.5 py-1.5 text-[11px] hover:bg-surface disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Unassigned"
          value={summary.unassigned_questions.length}
          detail={`${t.unassigned_writer} no writer · ${t.unassigned_lead_sme} no SME · ${t.unassigned_strategic_owner} no owner`}
        />
        <StatTile
          icon={<Users className="h-3.5 w-3.5" />}
          label="Overloaded writers"
          value={summary.overloaded_writers.length}
          detail={
            summary.overloaded_writers.length > 0
              ? (summary.overloaded_writers as any[])
                  .slice(0, 2)
                  .map((w) => `${w.display_name} (${w.question_count}q)`)
                  .join(" · ")
              : "None — workload looks balanced"
          }
        />
        <StatTile
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Sections without owner"
          value={summary.sections_without_owner.length}
          detail={
            summary.sections_without_owner.length > 0
              ? (summary.sections_without_owner as any[])
                  .slice(0, 3)
                  .map((s) => `§${s.section_number}`)
                  .join(", ")
              : "Every section has a strategic owner"
          }
        />
        <StatTile
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
          label="High-risk areas"
          value={summary.high_risk_areas.length}
          detail={
            summary.high_risk_areas.length > 0
              ? (summary.high_risk_areas as any[])
                  .slice(0, 3)
                  .map((a) =>
                    `${a.section_number ?? "—"} (${a.red_count}R/${a.yellow_count}Y)`,
                  )
                  .join(", ")
              : "No red questions, low yellow density"
          }
        />
      </div>

      {summary.unassigned_questions.length > 0 && (
        <details className="mt-4 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
          <summary className="cursor-pointer font-medium">
            Unassigned questions ({summary.unassigned_questions.length})
          </summary>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto">
            {(summary.unassigned_questions as any[]).map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 border-b border-border/30 py-1">
                <span className="truncate">
                  <strong className="font-mono text-[11px]">{q.question_number}</strong>{" "}
                  <span className="text-muted-foreground">— {q.title}</span>
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wider text-amber-400">
                  missing {q.missing.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function StatTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{detail}</div>
    </div>
  );
}
