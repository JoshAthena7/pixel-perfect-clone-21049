import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listSections } from "@/lib/v1/mission.functions";
import { normalizeStatus, STATUS_LABELS, type SectionStatus } from "@/lib/v1/mission";
import { AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<SectionStatus, string> = {
  not_started: "bg-[color:var(--v1-surface-hover)] text-[color:var(--v1-muted)]",
  in_progress: "bg-blue-500/15 text-blue-400",
  draft_done: "bg-green-500/15 text-green-400",
  in_review: "bg-amber-500/15 text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  blocked: "bg-red-500/15 text-red-400",
};

export function SectionsTracker() {
  const fetch = useServerFn(listSections);
  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["v1-sections"],
    queryFn: () => fetch(),
  });

  const complete = sections.filter((s) => normalizeStatus(s.studio_status) === "approved").length;
  const inProgress = sections.filter((s) =>
    ["in_progress", "draft_done", "in_review"].includes(normalizeStatus(s.studio_status)),
  ).length;
  const notStarted = sections.length - complete - inProgress;
  const pct = sections.length ? Math.round((complete / sections.length) * 100) : 0;

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--v1-text)]">Sections</h1>
          <span className="text-xs text-[color:var(--v1-muted)]">NJ CSOC</span>
        </div>
        <div className="mt-3 text-sm text-[color:var(--v1-muted)]">
          {sections.length} sections · {complete} complete · {inProgress} in progress · {notStarted} not started
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-[color:var(--v1-surface-hover)] overflow-hidden max-w-md">
          <div className="h-full rounded-full bg-[color:var(--v1-primary)]" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-[color:var(--v1-muted)] mt-1">{pct}% complete</div>
      </div>

      {isLoading && <div className="text-[color:var(--v1-muted)]">Loading…</div>}

      <div className="v1-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-[color:var(--v1-muted)] uppercase tracking-wider">
            <tr className="border-b border-[color:var(--v1-border)]">
              <th className="text-left py-3 px-4 w-16">#</th>
              <th className="text-left py-3 px-4">Section</th>
              <th className="text-left py-3 px-4 w-40">Owner</th>
              <th className="text-left py-3 px-4 w-24">Due</th>
              <th className="text-left py-3 px-4 w-32">Status</th>
              <th className="text-left py-3 px-4 w-20">Align</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const status = normalizeStatus(s.studio_status);
              const due = s.internal_due_date ? new Date(s.internal_due_date) : null;
              const daysUntil = due ? Math.ceil((due.getTime() - Date.now()) / 86400000) : null;
              const dueColor =
                daysUntil !== null && daysUntil < 3
                  ? "text-[color:var(--v1-red)]"
                  : daysUntil !== null && daysUntil < 7
                    ? "text-[color:var(--v1-amber)]"
                    : "text-[color:var(--v1-muted)]";
              const align = s.iris_alignment_pct;
              const alignColor =
                !align
                  ? "text-[color:var(--v1-muted)]"
                  : align >= 80
                    ? "text-[color:var(--v1-green)]"
                    : align >= 50
                      ? "text-[color:var(--v1-amber)]"
                      : "text-[color:var(--v1-red)]";
              return (
                <tr
                  key={s.id}
                  className="border-b border-[color:var(--v1-border)]/40 hover:bg-[color:var(--v1-surface-hover)]/50 transition-colors"
                  style={s.iris_flagged ? { borderLeft: "3px solid var(--v1-red)" } : undefined}
                >
                  <td className="py-3 px-4 num-tab text-[color:var(--v1-muted)]">{s.number}</td>
                  <td className="py-3 px-4">
                    <Link
                      to="/v1/sections/$sectionId"
                      params={{ sectionId: s.id }}
                      className="text-[color:var(--v1-text)] hover:text-[color:var(--v1-primary)] font-medium"
                    >
                      {s.title}
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    {s.assignee ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                          style={{ background: s.assignee.avatar_color || "#3b7fff" }}
                        >
                          {(s.assignee.display_name ?? "?").charAt(0)}
                        </span>
                        <span className="text-[color:var(--v1-text)] truncate">{s.assignee.display_name}</span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                        <AlertTriangle className="h-3 w-3" /> Unassigned
                      </span>
                    )}
                  </td>
                  <td className={`py-3 px-4 num-tab ${dueColor}`}>
                    {due ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  </td>
                  <td className={`py-3 px-4 num-tab font-semibold ${alignColor}`}>
                    {align ? `${align}%` : "—"}
                    {s.iris_flagged && <AlertTriangle className="inline ml-1 h-3 w-3 text-[color:var(--v1-red)]" />}
                  </td>
                </tr>
              );
            })}
            {!isLoading && sections.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-[color:var(--v1-muted)]">
                  No sections yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
