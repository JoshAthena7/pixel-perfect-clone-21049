import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Zap, AlertTriangle, ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";

export const Route = createFileRoute(
  "/_authenticated/missions/$missionId/iris-command",
)({
  component: IrisCommandPage,
});

const IRIS_INDIGO = "#6366F1";

type Question = {
  id: string;
  mission_id: string;
  question_number: string | null;
  title: string | null;
  status: string | null;
  health: "red" | "yellow" | "green" | null;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
};

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return `${d}d ago`;
}

function IrisCommandPage() {
  const { missionId } = Route.useParams();

  // ── Role gate ────────────────────────────────────────────────
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["iris-command-me", missionId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: mem } = await supabase
        .from("mission_members")
        .select("role")
        .eq("mission_id", missionId)
        .eq("user_id", user.id)
        .maybeSingle();
      return { id: user.id, role: mem?.role ?? null };
    },
  });

  const allowed = useMemo(() => {
    const r = me?.role;
    return r === "admin" || r === "lead" || r === "engagement_lead" || r === "project_manager";
  }, [me?.role]);

  // ── Mission data ─────────────────────────────────────────────
  const { data: mission } = useQuery({
    queryKey: ["iris-command-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,health,status,submission_date,win_themes")
        .eq("id", missionId).maybeSingle();
      return data;
    },
    enabled: allowed,
  });

  const { data: intel } = useQuery({
    queryKey: ["iris-command-intel", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_intel")
        .select("iris_brief,state_priorities,procurement_priorities,competitor_signals,compliance_flags,relevant_research,generated_at")
        .eq("mission_id", missionId).maybeSingle();
      return data;
    },
    enabled: allowed,
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["iris-command-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("questions")
        .select("id,mission_id,question_number,title,status,health,pens_down_date,assigned_writer_id")
        .eq("mission_id", missionId)
        .order("question_number", { ascending: true });
      return (data ?? []) as Question[];
    },
    enabled: allowed,
  });

  const counts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0, total: questions.length, complete: 0, unassigned: 0 };
    for (const q of questions) {
      if (q.health === "green") c.green++;
      else if (q.health === "yellow") c.yellow++;
      else if (q.health === "red") c.red++;
      if (q.status === "complete") c.complete++;
      if (!q.assigned_writer_id) c.unassigned++;
    }
    return c;
  }, [questions]);

  const alignment = counts.total > 0 ? Math.round((counts.green / counts.total) * 100) : 0;
  const completeness = counts.total > 0 ? Math.round((counts.complete / counts.total) * 100) : 0;
  const flags = useMemo(() => questions.filter((q) => q.health === "red" || q.health === "yellow"), [questions]);

  if (meLoading) {
    return <div className="mx-auto max-w-[1100px] px-10 py-12 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-[700px] px-10 py-20 text-center">
        <h1 className="text-xl font-semibold mb-2">IRIS Command is restricted</h1>
        <p className="text-sm text-muted-foreground mb-6">
          IRIS Command is available to Engagement Leads, Project Managers, and Admins.
        </p>
        <Link
          to="/missions/$missionId/brief"
          params={{ missionId }}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-white/5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Mission Brief
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#060b14" }}>
      <div className="mx-auto max-w-[1100px] px-10 pt-10 pb-16 space-y-10">
        {/* Header */}
        <header
          className="rounded-[12px] p-6"
          style={{
            background: `${IRIS_INDIGO}1A`,
            border: `1px solid ${IRIS_INDIGO}55`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link
                to="/missions/$missionId/brief"
                params={{ missionId }}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mb-3"
              >
                <ArrowLeft className="h-3 w-3" /> Mission Brief
              </Link>
              <div className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: IRIS_INDIGO }}>
                <Zap className="inline h-3 w-3 mr-1" /> IRIS COMMAND
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">
                {mission?.name ?? "Mission"}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Intelligence Engine View · Read-only diagnostic surface
              </p>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <div>Last analyzed: {timeAgo(intel?.generated_at)}</div>
            </div>
          </div>
        </header>

        {/* Summary grid */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SummaryCard label="Mission Health">
            <div className="text-2xl font-bold capitalize">{mission?.health ?? "—"}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              Alignment {alignment}% · Completeness {completeness}%
            </div>
          </SummaryCard>
          <SummaryCard label="Active Flags">
            <div className="text-2xl font-bold">{flags.length}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {counts.red} red · {counts.yellow} yellow
            </div>
          </SummaryCard>
          <SummaryCard label="Coverage">
            <div className="text-2xl font-bold">{counts.complete}/{counts.total}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {counts.unassigned} unassigned
            </div>
          </SummaryCard>
        </section>

        {/* Win theme alignment */}
        {Array.isArray(mission?.win_themes) && mission!.win_themes!.length > 0 && (
          <IrisSection title="Win Theme Alignment">
            <ul className="divide-y divide-white/[0.06]">
              {(mission!.win_themes as string[]).map((t, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span>{t}</span>
                  <span className="text-xs text-muted-foreground">Tracked</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Per-section alignment lives in the Sections tracker and on each section workspace.
            </p>
          </IrisSection>
        )}

        {/* Active flags */}
        <IrisSection title={`Active Flags (${flags.length})`}>
          {flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active flags. Mission is on track.</p>
          ) : (
            <ul className="space-y-3">
              {flags.slice(0, 25).map((q) => (
                <li key={q.id} className="flex items-start gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
                  <AlertTriangle
                    className="h-4 w-4 mt-0.5"
                    style={{ color: q.health === "red" ? "#ef4444" : "#eab308" }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {q.question_number ? `Section ${q.question_number} · ` : ""}{q.title ?? "Untitled"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {q.assigned_writer_id ? "Assigned" : "Unassigned"}
                      {q.status ? ` · ${q.status}` : ""}
                    </div>
                  </div>
                  <Link
                    to="/missions/$missionId/sections/$questionId"
                    params={{ missionId, questionId: q.id }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                    style={{ color: IRIS_INDIGO }}
                  >
                    Go to Section <ArrowRight className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </IrisSection>

        {/* IRIS full brief */}
        <IrisSection title="IRIS Full Brief">
          {intel?.iris_brief ? (
            <p className="text-sm leading-[1.7] whitespace-pre-wrap text-foreground/85">
              {intel.iris_brief}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              <RefreshCw className="inline h-3 w-3 mr-1" /> IRIS is preparing the full brief.
            </p>
          )}
        </IrisSection>

        {/* Intelligence summary */}
        <IrisSection title="Intelligence Summary">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">State Priorities</div>
              <p className="text-foreground/80">{intel?.state_priorities ?? "—"}</p>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">Procurement Priorities</div>
              <p className="text-foreground/80">{intel?.procurement_priorities ?? "—"}</p>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">Competitor Signals</div>
              <p className="text-foreground/80">{intel?.competitor_signals ?? "—"}</p>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-1">Compliance Flags</div>
              <p className="text-foreground/80">
                {Array.isArray(intel?.compliance_flags) && intel!.compliance_flags!.length > 0
                  ? `${intel!.compliance_flags!.length} flagged`
                  : "—"}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Link
              to="/missions/$missionId/intel"
              params={{ missionId }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
              style={{ color: IRIS_INDIGO }}
            >
              Go to Mission Intel <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </IrisSection>
      </div>
    </div>
  );
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px] p-4"
      style={{ background: `${IRIS_INDIGO}10`, border: `1px solid ${IRIS_INDIGO}33` }}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <Zap className="inline h-3 w-3 mr-1" style={{ color: IRIS_INDIGO }} />
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function IrisSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-[10px] p-5"
      style={{ background: `${IRIS_INDIGO}0A`, border: `1px solid ${IRIS_INDIGO}26` }}
    >
      <h2 className="text-[11px] font-bold uppercase tracking-[0.22em] mb-3" style={{ color: IRIS_INDIGO }}>
        <Zap className="inline h-3 w-3 mr-1" /> {title}
      </h2>
      {children}
    </section>
  );
}
