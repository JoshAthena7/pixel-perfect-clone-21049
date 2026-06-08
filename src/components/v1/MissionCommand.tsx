import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMissionOverview } from "@/lib/v1/mission.functions";
import { IrisBadge } from "./IrisBadge";
import { normalizeStatus } from "@/lib/v1/mission";
import { useHasSupabaseSession } from "@/hooks/useSupabaseSession";

export function MissionCommand() {
  const fetch = useServerFn(getMissionOverview);
  const hasSession = useHasSupabaseSession();
  const { data, isLoading } = useQuery({
    queryKey: ["v1-overview"],
    queryFn: () => fetch(),
    enabled: hasSession === true,
    retry: false,
  });

  if (isLoading || !data?.mission) {
    return <div className="p-10 text-[color:var(--v1-muted)]">Loading mission…</div>;
  }
  const { mission, themes, sections, clarifications } = data;

  // Health math
  const total = sections.length || 1;
  const started = sections.filter((s) => normalizeStatus(s.studio_status) !== "not_started").length;
  const completeness = Math.round((started / total) * 100);
  const avgAlign =
    sections.filter((s) => s.iris_alignment_pct).length > 0
      ? Math.round(
          sections.filter((s) => s.iris_alignment_pct).reduce((sum, s) => sum + (s.iris_alignment_pct ?? 0), 0) /
            sections.filter((s) => s.iris_alignment_pct).length,
        )
      : 0;
  const unassigned = sections.filter((s) => !s.assigned_user_id).length;
  const health = Math.round((completeness * 0.5 + avgAlign * 0.5));
  const healthLabel = health >= 80 ? "On Track" : health >= 60 ? "At Risk" : "Critical";
  const healthColor = health >= 80 ? "var(--v1-green)" : health >= 60 ? "var(--v1-amber)" : "var(--v1-red)";

  const submission = mission.submission_date ? new Date(mission.submission_date) : null;
  const daysOut = submission ? Math.max(0, Math.ceil((submission.getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto space-y-6">
      {/* Page header */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--v1-muted)]">
          {mission.state_agency ?? mission.client}
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[color:var(--v1-text)]">
          {mission.name} — Children's System of Care
        </h1>
        {submission && (
          <div className="mt-2 text-sm text-[color:var(--v1-muted)]">
            ⏱ {daysOut} days to submission · {submission.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>

      {/* IRIS Health */}
      <section className="v1-card p-6">
        <div className="flex items-center justify-between mb-4">
          <IrisBadge>Mission Health</IrisBadge>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold num-tab" style={{ color: healthColor }}>
              {health}%
            </span>
            <span className="text-sm font-medium" style={{ color: healthColor }}>
              {healthLabel}
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <HealthBar label="Alignment" pct={avgAlign} hint={avgAlign < 70 ? "⚠ Below threshold" : "On target"} />
          <HealthBar label="Completeness" pct={completeness} hint={`${started} of ${total} sections started`} />
          <HealthBar
            label="Risk"
            pct={100 - Math.min(100, unassigned * 20)}
            hint={`${unassigned} unassigned · Q&A deadline ${mission.qa_deadline ?? "TBD"}`}
            inverse
          />
        </div>
        <div className="mt-5 rounded-md border border-[color:var(--v1-iris)]/30 bg-[color:var(--v1-iris)]/[0.06] p-4">
          <div className="flex items-start gap-2">
            <IrisBadge />
            <p className="text-sm text-[color:var(--v1-text)]/90 leading-relaxed">
              {sections.filter((s) => s.iris_flagged).length > 0
                ? `${sections.filter((s) => s.iris_flagged).length} section(s) flagged for review. Focus the team on these before the ${mission.qa_deadline ?? "Q&A"} deadline.`
                : `Mission is tracking at ${health}% health with ${daysOut} days remaining. Keep pressing on assignment coverage and win-theme alignment.`}
            </p>
          </div>
        </div>
      </section>

      {/* Win Themes */}
      <section>
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--v1-muted)]">
          Win Themes
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {themes.length === 0 && (
            <div className="v1-card p-5 text-sm text-[color:var(--v1-muted)] col-span-2">
              No win themes defined yet.
            </div>
          )}
          {themes.map((t, i) => {
            // Mock alignment per theme — stable hash on title
            const align = 60 + ((t.title.length * 7) % 35);
            const color = align >= 80 ? "var(--v1-green)" : align >= 60 ? "var(--v1-amber)" : "var(--v1-red)";
            const sectionCount = t.question_ids?.length ?? Math.max(2, Math.floor(sections.length / Math.max(1, themes.length)));
            return (
              <div key={t.id} className="v1-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-[color:var(--v1-text)]">{t.title}</h3>
                  <span className="text-sm font-bold num-tab" style={{ color }}>
                    {align}%{align < 80 && " ⚠"}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[color:var(--v1-surface-hover)] overflow-hidden mb-3">
                  <div className="h-full rounded-full transition-all" style={{ width: `${align}%`, background: color }} />
                </div>
                <div className="flex items-center justify-between text-xs text-[color:var(--v1-muted)]">
                  <span>{sectionCount} sections</span>
                  {align >= 80 ? (
                    <span style={{ color: "var(--v1-green)" }}>✓ On track</span>
                  ) : (
                    <span className="inline-flex items-center gap-1" style={{ color: "var(--v1-iris)" }}>
                      ⚡ Needs attention
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Key Dates */}
      <section className="v1-card p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--v1-muted)] mb-3">
          Key Dates
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <KeyDate label="Client Q&A" date={mission.qa_deadline} />
          <KeyDate label="Pens Down" date={mission.pens_down_date} />
          <KeyDate label="Submission Due" date={mission.submission_date} highlight />
        </div>
      </section>

      {/* Clarifications */}
      <section className="v1-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--v1-muted)]">
            Client Clarifications
          </div>
          <div className="text-xs text-[color:var(--v1-muted)]">
            Q&A deadline: {mission.qa_deadline ?? "—"}
          </div>
        </div>
        {clarifications.length === 0 ? (
          <p className="text-sm text-[color:var(--v1-muted)] py-4">
            No clarifications submitted yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-[color:var(--v1-muted)]">
              <tr className="border-b border-[color:var(--v1-border)]">
                <th className="text-left py-2 pr-4 w-12">#</th>
                <th className="text-left py-2 pr-4">Question</th>
                <th className="text-left py-2 w-32">Status</th>
              </tr>
            </thead>
            <tbody>
              {clarifications.map((c) => (
                <tr key={c.id} className="border-b border-[color:var(--v1-border)]/40">
                  <td className="py-2 pr-4 num-tab">{c.number}</td>
                  <td className="py-2 pr-4">{c.question}</td>
                  <td className="py-2 capitalize">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function HealthBar({ label, pct, hint, inverse }: { label: string; pct: number; hint?: string; inverse?: boolean }) {
  const score = inverse ? pct : pct;
  const color = score >= 80 ? "var(--v1-green)" : score >= 60 ? "var(--v1-amber)" : "var(--v1-red)";
  return (
    <div className="flex items-center gap-4">
      <div className="w-32 text-sm text-[color:var(--v1-muted)]">{label}</div>
      <div className="w-12 text-sm font-bold num-tab" style={{ color }}>
        {pct}%
      </div>
      <div className="flex-1 h-2 rounded-full bg-[color:var(--v1-surface-hover)] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      {hint && <div className="text-xs text-[color:var(--v1-muted)] w-64 text-right">{hint}</div>}
    </div>
  );
}

function KeyDate({ label, date, highlight }: { label: string; date: string | null | undefined; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[color:var(--v1-muted)]">{label}</div>
      <div className={`mt-1 font-semibold ${highlight ? "text-[color:var(--v1-primary)]" : "text-[color:var(--v1-text)]"}`}>
        {date ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
      </div>
    </div>
  );
}
