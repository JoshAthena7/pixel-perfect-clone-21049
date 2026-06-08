import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Calendar, ListChecks, Brain } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/missions/$missionId")({
  component: SingleMissionView,
});

function SingleMissionView() {
  const { missionId } = Route.useParams();

  const { data: mission, isLoading } = useQuery({
    queryKey: ["olympus-mission", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("missions")
        .select("*")
        .eq("id", missionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading mission…</div>;
  }

  if (!mission) {
    return (
      <div className="p-8">
        <div className="text-lg font-semibold">Mission not found</div>
        <Link to="/admin" className="mt-3 inline-flex items-center gap-1.5 text-sm text-amber-300 hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> All Missions
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface/40 px-5">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> All Missions
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <h1 className="text-sm font-semibold text-foreground truncate">{mission.name}</h1>
          {mission.client && (
            <span className="text-xs text-muted-foreground">{mission.client}</span>
          )}
        </div>
        <Link
          to="/admin/missions/$missionId/setup"
          params={{ missionId }}
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
        >
          Open Setup Record
        </Link>
      </header>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <IrisPanel missionId={missionId} />
        <SectionHealthPanel missionId={missionId} />
        <RequirementsPanel missionId={missionId} />
        <DeadlinesPanel submissionDate={mission.submission_date} />
      </div>
    </div>
  );
}

/* ─────────── Panel A: IRIS ─────────── */

function IrisPanel({ missionId }: { missionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["olympus-iris", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_intelligence")
        .select("*")
        .eq("mission_id", missionId);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Panel icon={<Brain className="h-4 w-4" />} title="IRIS Intelligence">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">IRIS has not run on this mission.</p>
      ) : (
        <ul className="space-y-2">
          {data.map((row: any) => (
            <li key={row.id} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
              <div>
                <div className="text-sm font-medium text-foreground">
                  {row.layer ?? row.kind ?? row.type ?? "Layer"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Generated · {formatDateTime(row.created_at ?? row.updated_at)}
                </div>
              </div>
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] uppercase text-emerald-300">
                Ready
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ─────────── Panel B: Section Health ─────────── */

function SectionHealthPanel({ missionId }: { missionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["olympus-sections", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("question_records")
        .select("id,section_number,title,health,pens_down_date,assigned_writer_id")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      const writerIds = Array.from(new Set(rows.map((r: any) => r.assigned_writer_id).filter(Boolean)));
      let writers: Record<string, string> = {};
      if (writerIds.length > 0) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,display_name,email")
          .in("id", writerIds);
        (ps ?? []).forEach((p: any) => {
          writers[p.id] = p.display_name || p.email || "—";
        });
      }
      return rows.map((r: any) => ({ ...r, writer: writers[r.assigned_writer_id] ?? "Unassigned" }));
    },
  });

  return (
    <Panel icon={<FileText className="h-4 w-4" />} title="Section Health">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sections yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Section</th>
                <th className="px-2 py-1.5 text-left font-medium">Writer</th>
                <th className="px-2 py-1.5 text-left font-medium">Health</th>
                <th className="px-2 py-1.5 text-left font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s: any) => (
                <tr key={s.id} className="border-t border-border/60">
                  <td className="px-2 py-1.5">
                    <div className="text-foreground">{s.section_number ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground truncate max-w-[18rem]">{s.title}</div>
                  </td>
                  <td className="px-2 py-1.5">{s.writer}</td>
                  <td className="px-2 py-1.5"><HealthDot value={s.health} /></td>
                  <td className="px-2 py-1.5 text-muted-foreground">{formatDate(s.pens_down_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ─────────── Panel C: Requirements ─────────── */

function RequirementsPanel({ missionId }: { missionId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["olympus-reqs", missionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("compliance_requirements")
        .select("id,severity")
        .eq("mission_id", missionId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = (data ?? []).reduce(
    (acc: any, r: any) => {
      const sev = (r.severity ?? "").toLowerCase();
      if (sev === "critical" || sev === "red") acc.red += 1;
      else if (sev === "important" || sev === "yellow") acc.yellow += 1;
      else acc.green += 1;
      return acc;
    },
    { red: 0, yellow: 0, green: 0 },
  );

  return (
    <Panel icon={<ListChecks className="h-4 w-4" />} title="Requirements">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No requirements extracted.</p>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Total" value={data.length} />
          <Stat label="Green" value={counts.green} dotClass="bg-emerald-500" />
          <Stat label="Yellow" value={counts.yellow} dotClass="bg-amber-500" />
          <Stat label="Red" value={counts.red} dotClass="bg-rose-500" />
        </div>
      )}
    </Panel>
  );
}

/* ─────────── Panel D: Deadlines ─────────── */

function DeadlinesPanel({ submissionDate }: { submissionDate: string | null }) {
  return (
    <Panel icon={<Calendar className="h-4 w-4" />} title="Deadlines">
      {!submissionDate ? (
        <p className="text-sm text-muted-foreground">No submission date set.</p>
      ) : (
        <div>
          <div className="text-2xl font-semibold text-foreground">{formatDate(submissionDate)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{countdown(submissionDate)}</div>
        </div>
      )}
    </Panel>
  );
}

/* ─────────── Shared ─────────── */

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface/40 p-4">
      <header className="mb-3 flex items-center gap-2">
        <span className="text-[color:var(--athena-gold)]">{icon}</span>
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-foreground">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Stat({ label, value, dotClass }: { label: string; value: number; dotClass?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {dotClass && <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />}
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function HealthDot({ value }: { value: string | null }) {
  const v = (value ?? "").toLowerCase();
  const color =
    v === "green" ? "bg-emerald-500"
    : v === "yellow" ? "bg-amber-500"
    : v === "red" ? "bg-rose-500"
    : "bg-muted-foreground/40";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-xs capitalize">{value ?? "—"}</span>
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return iso; }
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)} days past`;
  if (days === 0) return "Today";
  return `${days} days remaining`;
}
