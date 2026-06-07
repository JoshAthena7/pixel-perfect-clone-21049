import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listMySections } from "@/lib/v1/mission.functions";
import { normalizeStatus, STATUS_LABELS } from "@/lib/v1/mission";

export function MySections() {
  const fetch = useServerFn(listMySections);
  const { data: sections = [], isLoading } = useQuery({
    queryKey: ["v1-my-sections"],
    queryFn: () => fetch(),
  });

  // Flagged first
  const sorted = [...sections].sort((a, b) => {
    if (a.iris_flagged && !b.iris_flagged) return -1;
    if (!a.iris_flagged && b.iris_flagged) return 1;
    return (a.internal_due_date ?? "").localeCompare(b.internal_due_date ?? "");
  });

  const atRisk = sections.filter((s) => s.iris_flagged).length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = sections.filter((s) => s.internal_due_date && s.internal_due_date < today).length;

  return (
    <div className="px-8 py-8 max-w-[1100px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight text-[color:var(--v1-text)]">My Sections</h1>
      <div className="mt-2 text-sm text-[color:var(--v1-muted)]">
        NJ CSOC · {sections.length} assigned · {atRisk} at risk · {overdue} overdue
      </div>

      {isLoading && <div className="mt-6 text-[color:var(--v1-muted)]">One moment…</div>}

      <div className="mt-6 v1-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs text-[color:var(--v1-muted)] uppercase">
            <tr className="border-b border-[color:var(--v1-border)]">
              <th className="text-left py-3 px-4 w-16">#</th>
              <th className="text-left py-3 px-4">Section</th>
              <th className="text-left py-3 px-4 w-24">Due</th>
              <th className="text-left py-3 px-4 w-32">Status</th>
              <th className="text-left py-3 px-4 w-20">Align</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const status = normalizeStatus(s.studio_status);
              const due = s.internal_due_date ? new Date(s.internal_due_date) : null;
              return (
                <tr
                  key={s.id}
                  className="border-b border-[color:var(--v1-border)]/40 hover:bg-[color:var(--v1-surface-hover)]/50"
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
                  <td className="py-3 px-4 num-tab text-[color:var(--v1-muted)]">
                    {due ? due.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td className="py-3 px-4 text-[color:var(--v1-muted)]">{STATUS_LABELS[status]}</td>
                  <td className="py-3 px-4 num-tab text-[color:var(--v1-muted)]">
                    {s.iris_alignment_pct ? `${s.iris_alignment_pct}%` : "—"}
                  </td>
                </tr>
              );
            })}
            {!isLoading && sections.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-[color:var(--v1-muted)]">
                  No sections assigned to you yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
