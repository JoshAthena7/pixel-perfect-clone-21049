import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, formatDistanceToNowStrict, format } from "date-fns";
import { Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <h1 className="text-4xl font-medium text-foreground mb-2">Fast Reports</h1>
      <p className="text-muted-foreground mb-8">
        Live snapshots of mission health, team load, assignment status, and intelligence coverage.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PortfolioHealthCard />
        <TeamAvailabilityCard />
        <AssignmentAcceptanceCard />
        <IntelligenceCoverageCard />
      </div>
    </div>
  );
}

function ReportCard({
  title, subtitle, onExport, exportDisabled, children,
}: {
  title: string;
  subtitle?: string;
  onExport: () => void;
  exportDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface/40 border-l-4 border-l-[var(--athena-gold)] overflow-hidden">
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
        <div>
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <Button size="sm" variant="outline" onClick={onExport} disabled={exportDisabled}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
        </Button>
      </header>
      <div className="max-h-[460px] overflow-auto">{children}</div>
    </section>
  );
}

function LoadingRow({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="px-5 py-10 text-[14px] text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-5 py-10 text-[14px] text-muted-foreground">{label}</div>;
}

// ───────────────── Report 1: Mission Portfolio Health ─────────────────
function PortfolioHealthCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-portfolio-health"],
    queryFn: async () => {
      const { data: missions, error } = await supabase
        .from("missions")
        .select("id,name,client_name,status,submission_deadline,intelligence_graph_completeness,mission_team_members(count),mission_questions(id,health_status)")
        .neq("status", "archived")
        .order("submission_deadline", { ascending: true });
      if (error) throw error;
      return (missions ?? []).map((m: any) => {
        const qs = m.mission_questions ?? [];
        const healthy = qs.filter((q: any) => q.health_status === "healthy").length;
        const watch = qs.filter((q: any) => q.health_status === "watch").length;
        const atRisk = qs.filter((q: any) => q.health_status === "at_risk").length;
        const total = qs.length;
        const days = m.submission_deadline
          ? differenceInCalendarDays(new Date(m.submission_deadline), new Date())
          : null;
        return {
          id: m.id,
          name: m.name,
          client: m.client_name ?? "",
          days,
          healthy, watch, atRisk, total,
          team: m.mission_team_members?.[0]?.count ?? 0,
          intel: Math.round(m.intelligence_graph_completeness ?? 0),
          progress: total ? Math.round((healthy / total) * 100) : 0,
        };
      });
    },
  });

  const rows = data ?? [];
  const dayColor = (d: number | null) =>
    d == null ? "text-muted-foreground"
      : d < 14 ? "text-red-400"
      : d < 30 ? "text-amber-400"
      : "text-green-400";

  return (
    <ReportCard
      title="Mission Portfolio Health"
      subtitle={`${rows.length} active mission${rows.length === 1 ? "" : "s"}`}
      exportDisabled={!rows.length}
      onExport={() => downloadCsv(
        `portfolio-health-${format(new Date(), "yyyy-MM-dd")}.csv`,
        rows.map((r) => ({
          Mission: r.name, Client: r.client,
          "Days to Submission": r.days ?? "",
          Healthy: r.healthy, Watch: r.watch, "At Risk": r.atRisk,
          "Team Size": r.team, "Intel %": r.intel, "Progress %": r.progress,
        })),
        ["Mission", "Client", "Days to Submission", "Healthy", "Watch", "At Risk", "Team Size", "Intel %", "Progress %"],
      )}
    >
      {isLoading ? <LoadingRow /> :
       !rows.length ? <EmptyRow label="No active missions." /> :
       <table className="w-full text-[14px]">
        <thead className="bg-muted/30 text-[12px]  text-muted-foreground sticky top-0">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Mission</th>
            <th className="text-left px-4 py-2 font-medium">Client</th>
            <th className="text-right px-4 py-2 font-medium">Days</th>
            <th className="text-left px-4 py-2 font-medium">Q Health</th>
            <th className="text-right px-4 py-2 font-medium">Team</th>
            <th className="text-right px-4 py-2 font-medium">Intel</th>
            <th className="text-right px-4 py-2 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-4 py-2 font-medium text-foreground">{r.name}</td>
              <td className="px-4 py-2 text-muted-foreground">{r.client || "—"}</td>
              <td className={cn("px-4 py-2 text-right font-medium", dayColor(r.days))}>
                {r.days == null ? "—" : r.days}
              </td>
              <td className="px-4 py-2 text-[12px]">
                <span className="text-green-400">{r.healthy}</span>
                {" / "}<span className="text-amber-400">{r.watch}</span>
                {" / "}<span className="text-red-400">{r.atRisk}</span>
              </td>
              <td className="px-4 py-2 text-right">{r.team}</td>
              <td className="px-4 py-2 text-right">{r.intel}%</td>
              <td className="px-4 py-2 text-right">{r.progress}%</td>
            </tr>
          ))}
        </tbody>
       </table>}
    </ReportCard>
  );
}

// ───────────────── Report 2: Team Availability ─────────────────
function TeamAvailabilityCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-team-availability"],
    queryFn: async () => {
      const [{ data: members, error: mErr }, { data: assignments, error: aErr }, { data: missions, error: msErr }] = await Promise.all([
        supabase.from("atlas_team_members")
          .select("id,first_name,last_name,job_title,atlas_role,atlas_last_active_at,email")
          .eq("is_removed", false),
        supabase.from("mission_team_members").select("user_id,mission_id"),
        supabase.from("missions").select("id,status").neq("status", "archived"),
      ]);
      if (mErr) throw mErr; if (aErr) throw aErr; if (msErr) throw msErr;
      const activeMissionIds = new Set((missions ?? []).map((m: any) => m.id));
      const { data: qAssign, error: qErr } = await supabase
        .from("mission_assignments")
        .select("assigned_writer_id,mission_id");
      if (qErr) throw qErr;

      return (members ?? []).map((p: any) => {
        const activeMissions = new Set(
          (assignments ?? [])
            .filter((a: any) => a.user_id === p.id && activeMissionIds.has(a.mission_id))
            .map((a: any) => a.mission_id),
        );
        const questions = (qAssign ?? []).filter(
          (q: any) => q.assigned_writer_id === p.id && activeMissionIds.has(q.mission_id),
        ).length;
        return {
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || "Unnamed",
          role: p.atlas_role ?? p.job_title ?? "—",
          activeMissions: activeMissions.size,
          questions,
          lastActive: p.atlas_last_active_at,
        };
      }).sort((a, b) => b.activeMissions - a.activeMissions || b.questions - a.questions);
    },
  });

  const rows = data ?? [];
  return (
    <ReportCard
      title="Team Availability"
      subtitle={`${rows.length} active team member${rows.length === 1 ? "" : "s"}, sorted by load`}
      exportDisabled={!rows.length}
      onExport={() => downloadCsv(
        `team-availability-${format(new Date(), "yyyy-MM-dd")}.csv`,
        rows.map((r) => ({
          Name: r.name, Role: r.role,
          "Active Missions": r.activeMissions,
          "Questions Assigned": r.questions,
          "Last Active": r.lastActive ?? "",
        })),
        ["Name", "Role", "Active Missions", "Questions Assigned", "Last Active"],
      )}
    >
      {isLoading ? <LoadingRow /> :
       !rows.length ? <EmptyRow label="No team members." /> :
       <table className="w-full text-[14px]">
        <thead className="bg-muted/30 text-[12px]  text-muted-foreground sticky top-0">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Name</th>
            <th className="text-left px-4 py-2 font-medium">Role</th>
            <th className="text-right px-4 py-2 font-medium">Missions</th>
            <th className="text-right px-4 py-2 font-medium">Questions</th>
            <th className="text-left px-4 py-2 font-medium">Last Active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-4 py-2 font-medium text-foreground">{r.name}</td>
              <td className="px-4 py-2 text-muted-foreground">{r.role}</td>
              <td className="px-4 py-2 text-right">{r.activeMissions}</td>
              <td className="px-4 py-2 text-right">{r.questions}</td>
              <td className="px-4 py-2 text-muted-foreground text-[12px]">
                {r.lastActive ? formatDistanceToNowStrict(new Date(r.lastActive), { addSuffix: true }) : "Never"}
              </td>
            </tr>
          ))}
        </tbody>
       </table>}
    </ReportCard>
  );
}

// ───────────────── Report 3: Assignment Acceptance Status ─────────────────
function AssignmentAcceptanceCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-assignment-acceptance"],
    queryFn: async () => {
      const { data: missions, error: msErr } = await supabase
        .from("missions").select("id,name,status").neq("status", "archived");
      if (msErr) throw msErr;
      const missionMap = new Map((missions ?? []).map((m: any) => [m.id, m.name]));
      const activeIds = Array.from(missionMap.keys());
      if (!activeIds.length) return [];

      const { data: assignments, error } = await supabase
        .from("mission_assignments")
        .select("id,mission_id,question_id,assigned_writer_id,acceptance_status,assigned_at")
        .in("mission_id", activeIds)
        .neq("acceptance_status", "accepted");
      if (error) throw error;

      const writerIds = Array.from(new Set((assignments ?? []).map((a: any) => a.assigned_writer_id).filter(Boolean)));
      const qIds = Array.from(new Set((assignments ?? []).map((a: any) => a.question_id).filter(Boolean)));

      const [{ data: writers }, { data: questions }] = await Promise.all([
        writerIds.length
          ? supabase.from("atlas_team_members").select("id,first_name,last_name,email").in("id", writerIds)
          : Promise.resolve({ data: [] as any[] }),
        qIds.length
          ? supabase.from("mission_questions").select("id,question_number").in("id", qIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const writerMap = new Map((writers ?? []).map((w: any) => [w.id, `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || w.email]));
      const qMap = new Map((questions ?? []).map((q: any) => [q.id, q.question_number]));

      return (assignments ?? []).map((a: any) => {
        const days = a.assigned_at
          ? differenceInCalendarDays(new Date(), new Date(a.assigned_at))
          : 0;
        return {
          id: a.id,
          questionNumber: qMap.get(a.question_id) ?? "—",
          mission: missionMap.get(a.mission_id) ?? "—",
          writer: writerMap.get(a.assigned_writer_id) ?? "Unassigned",
          status: a.acceptance_status ?? "pending",
          days,
        };
      }).sort((a, b) => b.days - a.days);
    },
  });

  const rows = data ?? [];
  const statusLabel = (s: string) =>
    s === "need_help" ? "Need Help" :
    s === "capacity_concern" ? "Capacity Concern" :
    s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <ReportCard
      title="Assignment Acceptance Status"
      subtitle={`${rows.length} unaccepted, longest waiting first`}
      exportDisabled={!rows.length}
      onExport={() => downloadCsv(
        `assignment-acceptance-${format(new Date(), "yyyy-MM-dd")}.csv`,
        rows.map((r) => ({
          "Question #": r.questionNumber, Mission: r.mission, Writer: r.writer,
          Status: statusLabel(r.status), "Days Since Assigned": r.days,
        })),
        ["Question #", "Mission", "Writer", "Status", "Days Since Assigned"],
      )}
    >
      {isLoading ? <LoadingRow /> :
       !rows.length ? <EmptyRow label="All assignments accepted. 🎉" /> :
       <table className="w-full text-[14px]">
        <thead className="bg-muted/30 text-[12px]  text-muted-foreground sticky top-0">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Q #</th>
            <th className="text-left px-4 py-2 font-medium">Mission</th>
            <th className="text-left px-4 py-2 font-medium">Writer</th>
            <th className="text-left px-4 py-2 font-medium">Status</th>
            <th className="text-right px-4 py-2 font-medium">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-4 py-2 font-medium">{r.questionNumber}</td>
              <td className="px-4 py-2 text-muted-foreground truncate max-w-[180px]">{r.mission}</td>
              <td className="px-4 py-2">{r.writer}</td>
              <td className="px-4 py-2 text-[12px]">{statusLabel(r.status)}</td>
              <td className={cn(
                "px-4 py-2 text-right font-medium",
                r.days > 7 ? "text-red-400" : r.days > 3 ? "text-amber-400" : "text-muted-foreground",
              )}>{r.days}</td>
            </tr>
          ))}
        </tbody>
       </table>}
    </ReportCard>
  );
}

// ───────────────── Report 4: Intelligence Coverage ─────────────────
function IntelligenceCoverageCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-intelligence-coverage"],
    queryFn: async () => {
      const { data: missions, error } = await supabase
        .from("missions")
        .select("id,name,intelligence_graph_completeness,intelligence_feed_items(count),competitor_profiles(count),procurement_evolution_records(count)")
        .neq("status", "archived")
        .order("intelligence_graph_completeness", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (missions ?? []).map((m: any) => ({
        id: m.id,
        name: m.name,
        intel: Math.round(m.intelligence_graph_completeness ?? 0),
        feedItems: m.intelligence_feed_items?.[0]?.count ?? 0,
        competitors: m.competitor_profiles?.[0]?.count ?? 0,
        priorRfp: (m.procurement_evolution_records?.[0]?.count ?? 0) > 0,
      }));
    },
  });

  const rows = data ?? [];
  return (
    <ReportCard
      title="Intelligence Coverage"
      subtitle={`${rows.length} mission${rows.length === 1 ? "" : "s"}, richest first`}
      exportDisabled={!rows.length}
      onExport={() => downloadCsv(
        `intelligence-coverage-${format(new Date(), "yyyy-MM-dd")}.csv`,
        rows.map((r) => ({
          Mission: r.name, "Intel %": r.intel,
          "Feed Items": r.feedItems, "Competitors Profiled": r.competitors,
          "Prior RFP Analyzed": r.priorRfp ? "Yes" : "No",
        })),
        ["Mission", "Intel %", "Feed Items", "Competitors Profiled", "Prior RFP Analyzed"],
      )}
    >
      {isLoading ? <LoadingRow /> :
       !rows.length ? <EmptyRow label="No active missions." /> :
       <table className="w-full text-[14px]">
        <thead className="bg-muted/30 text-[12px]  text-muted-foreground sticky top-0">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Mission</th>
            <th className="text-right px-4 py-2 font-medium">Intel</th>
            <th className="text-right px-4 py-2 font-medium">Feed</th>
            <th className="text-right px-4 py-2 font-medium">Competitors</th>
            <th className="text-center px-4 py-2 font-medium">Prior RFP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border/50">
              <td className="px-4 py-2 font-medium text-foreground">{r.name}</td>
              <td className={cn(
                "px-4 py-2 text-right font-medium",
                r.intel >= 70 ? "text-green-400" : r.intel >= 40 ? "text-amber-400" : "text-red-400",
              )}>{r.intel}%</td>
              <td className="px-4 py-2 text-right">{r.feedItems}</td>
              <td className="px-4 py-2 text-right">{r.competitors}</td>
              <td className="px-4 py-2 text-center">{r.priorRfp ? "✓" : "—"}</td>
            </tr>
          ))}
        </tbody>
       </table>}
    </ReportCard>
  );
}
