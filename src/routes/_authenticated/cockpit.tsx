import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plane, ArrowRight, AlertTriangle, Clock, ArrowLeft } from "lucide-react";

type CockpitSearch = { missionId?: string };

export const Route = createFileRoute("/_authenticated/cockpit")({
  validateSearch: (search: Record<string, unknown>): CockpitSearch => ({
    missionId: typeof search.missionId === "string" ? search.missionId : undefined,
  }),
  component: CockpitPage,
});

// ── TYPES ────────────────────────────────────────────────
type AssignedRow = {
  id: string;
  mission_id: string;
  question_number: string;
  section_number: string | null;
  title: string;
  status: string | null;
  health: "red" | "yellow" | "green" | null;
  current_score: number | null;
  pens_down_date: string | null;
  assigned_writer_id: string | null;
  assigned_sme_id: string | null;
};

type Mission = {
  id: string;
  name: string;
  client: string | null;
  state_agency: string | null;
  submission_date: string | null;
  status: string | null;
  health: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  ready_for_review: "In review",
  approved: "Complete",
};

function statusClass(db: string | null | undefined) {
  const v = db ?? "not_started";
  if (v === "in_progress") return "bg-sky-500/10 text-sky-300 border-sky-500/25";
  if (v === "ready_for_review") return "bg-amber-500/10 text-amber-300 border-amber-500/25";
  if (v === "approved") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  return "bg-muted/40 text-muted-foreground border-border";
}

function healthDot(h: AssignedRow["health"]) {
  if (h === "red") return "bg-red-500";
  if (h === "yellow") return "bg-amber-400";
  if (h === "green") return "bg-emerald-500";
  return "bg-muted";
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date).getTime();
  const now = Date.now();
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function fmtDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── COMPONENT ────────────────────────────────────────────
function CockpitPage() {
  const { missionId: filterMissionId } = Route.useSearch();
  const { data: me } = useQuery({
    queryKey: ["cockpit-me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const meId = me?.id ?? null;

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["cockpit-assigned", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select(
          "id,mission_id,question_number,section_number,title,status,health,current_score,pens_down_date,assigned_writer_id,assigned_sme_id"
        )
        .or(`assigned_writer_id.eq.${meId},assigned_sme_id.eq.${meId}`)
        .order("pens_down_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as AssignedRow[];
    },
  });

  const rows = useMemo(
    () => (filterMissionId ? allRows.filter((r) => r.mission_id === filterMissionId) : allRows),
    [allRows, filterMissionId],
  );

  const missionIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.mission_id))),
    [rows]
  );

  const { data: missions = [] } = useQuery({
    queryKey: ["cockpit-missions", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("id,name,client,state_agency,submission_date,status,health")
        .in("id", missionIds);
      if (error) throw error;
      return (data ?? []) as Mission[];
    },
  });

  const missionById = useMemo(
    () => new Map(missions.map((m) => [m.id, m])),
    [missions]
  );

  // Group rows by mission, sort missions by nearest submission date
  const grouped = useMemo(() => {
    const map = new Map<string, AssignedRow[]>();
    for (const r of rows) {
      const list = map.get(r.mission_id) ?? [];
      list.push(r);
      map.set(r.mission_id, list);
    }
    const arr = Array.from(map.entries()).map(([mid, items]) => ({
      mission: missionById.get(mid) ?? null,
      missionId: mid,
      items,
    }));
    arr.sort((a, b) => {
      const da = a.mission?.submission_date
        ? new Date(a.mission.submission_date).getTime()
        : Infinity;
      const db = b.mission?.submission_date
        ? new Date(b.mission.submission_date).getTime()
        : Infinity;
      return da - db;
    });
    return arr;
  }, [rows, missionById]);

  // Summary counts
  const totals = useMemo(() => {
    const total = rows.length;
    const red = rows.filter((r) => r.health === "red").length;
    const overdue = rows.filter((r) => {
      const d = daysUntil(r.pens_down_date);
      return d !== null && d < 0 && r.status !== "approved";
    }).length;
    const inReview = rows.filter((r) => r.status === "ready_for_review").length;
    return { total, red, overdue, inReview };
  }, [rows]);

  return (
    <div className="mission-room-bg min-h-screen">
      <style>{`
        .mission-room-bg {
          background-color: #060b14;
          background-image: radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .ck-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: hsl(var(--muted-foreground));
          margin-bottom: 12px;
        }
      `}</style>

      <div className="mx-auto max-w-[1100px] px-10 pt-12 pb-16 space-y-10">
        {/* Header */}
        <header className="space-y-3">
          {filterMissionId && (
            <Link
              to="/cockpit"
              className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              All Missions
            </Link>
          )}
          <div className="flex items-center gap-3">
            <Plane size={20} strokeWidth={1.5} className="text-[#3b7fff]" />
            <h1 className="text-[28px] font-bold tracking-tight text-white">Cockpit</h1>
            {filterMissionId && (
              <span className="rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Filtered to one mission
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            {filterMissionId
              ? "Your assigned sections for this mission only."
              : "Everything assigned to you across every mission. One list, one focus — grouped by mission, sorted by deadline."}
          </p>
        </header>

        {/* Summary row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="My Sections" value={totals.total} />
          <SummaryCard
            label="At Risk"
            value={totals.red}
            tone={totals.red > 0 ? "red" : "muted"}
          />
          <SummaryCard
            label="Overdue"
            value={totals.overdue}
            tone={totals.overdue > 0 ? "red" : "muted"}
          />
          <SummaryCard
            label="In Review"
            value={totals.inReview}
            tone={totals.inReview > 0 ? "amber" : "muted"}
          />
        </section>

        {/* Mission groups */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading your sections…</div>
        ) : grouped.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {grouped.map(({ mission, missionId, items }) => (
              <MissionGroup
                key={missionId}
                mission={mission}
                missionId={missionId}
                items={items}
                meId={meId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SUB-COMPONENTS ───────────────────────────────────────

function SummaryCard({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "red" | "amber" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-400"
      : tone === "amber"
      ? "text-amber-300"
      : tone === "green"
      ? "text-emerald-400"
      : "text-foreground";
  return (
    <div className="rounded-[10px] border border-border bg-card px-5 py-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-2 text-[22px] font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function MissionGroup({
  mission,
  missionId,
  items,
  meId,
}: {
  mission: Mission | null;
  missionId: string;
  items: AssignedRow[];
  meId: string | null;
}) {
  const submitDays = daysUntil(mission?.submission_date ?? null);
  const submitTone =
    submitDays === null
      ? "text-muted-foreground"
      : submitDays < 0
      ? "text-red-400 font-semibold"
      : submitDays <= 14
      ? "text-amber-300"
      : "text-muted-foreground";

  return (
    <section className="rounded-[12px] border border-border bg-card/40">
      {/* Mission header */}
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Mission
            </span>
            <span className="text-[10px] text-muted-foreground">
              · {items.length} {items.length === 1 ? "section" : "sections"}
            </span>
          </div>
          <Link
            to="/missions/$missionId/brief"
            params={{ missionId }}
            className="text-[15px] font-semibold text-foreground hover:underline truncate block"
          >
            {mission?.name ?? "Mission"}
          </Link>
          {(mission?.client || mission?.state_agency) && (
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {mission?.state_agency ?? mission?.client}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Submission
          </div>
          <div className="text-[13px] font-medium text-foreground mt-0.5">
            {fmtDate(mission?.submission_date ?? null)}
          </div>
          {submitDays !== null && (
            <div className={`text-[11px] mt-0.5 ${submitTone}`}>
              {submitDays < 0 ? `${Math.abs(submitDays)}d overdue` : `${submitDays}d`}
            </div>
          )}
        </div>
      </div>

      {/* Section rows */}
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <SectionRow key={it.id} item={it} missionId={missionId} meId={meId} />
        ))}
      </ul>
    </section>
  );
}

function SectionRow({
  item,
  missionId,
  meId,
}: {
  item: AssignedRow;
  missionId: string;
  meId: string | null;
}) {
  const pdDays = daysUntil(item.pens_down_date);
  const overdue = pdDays !== null && pdDays < 0 && item.status !== "approved";
  const role =
    item.assigned_writer_id === meId
      ? "Writer"
      : item.assigned_sme_id === meId
      ? "SME"
      : null;

  return (
    <li>
      <Link
        to="/missions/$missionId/sections/$questionId"
        params={{ missionId, questionId: item.id }}
        className="group flex items-center gap-4 px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${healthDot(item.health)}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
            <span className="font-mono">{item.question_number}</span>
            {item.section_number && (
              <>
                <span>·</span>
                <span>Section {item.section_number}</span>
              </>
            )}
            {role && (
              <>
                <span>·</span>
                <span className="text-[10px] font-bold uppercase tracking-[0.15em]">
                  {role}
                </span>
              </>
            )}
          </div>
          <div className="text-[13px] font-medium text-foreground truncate">
            {item.title || "Untitled section"}
          </div>
        </div>

        <div className="hidden md:flex items-center gap-3 shrink-0">
          {item.pens_down_date && (
            <div
              className={`flex items-center gap-1 text-[11px] ${
                overdue ? "text-red-400 font-semibold" : "text-muted-foreground"
              }`}
            >
              {overdue ? <AlertTriangle size={12} /> : <Clock size={12} />}
              <span>{fmtDate(item.pens_down_date)}</span>
            </div>
          )}
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass(
              item.status
            )}`}
          >
            {STATUS_LABEL[item.status ?? "not_started"] ?? "Not started"}
          </span>
        </div>

        <ArrowRight
          size={14}
          className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        />
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg border p-10 text-center"
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <Plane
        size={28}
        strokeWidth={1.25}
        className="text-muted-foreground mx-auto mb-3"
      />
      <div className="text-sm font-medium text-foreground mb-1">Nothing on your plate</div>
      <p className="text-[13px] text-muted-foreground max-w-md mx-auto">
        You have no sections assigned across any active missions. When a mission
        lead assigns you a section, it will show up here.
      </p>
    </div>
  );
}
