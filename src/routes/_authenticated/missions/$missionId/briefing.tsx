import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/briefing")({
  component: BriefingBookPage,
});

function BriefingBookPage() {
  const { missionId } = Route.useParams();

  const { data: mission } = useQuery({
    queryKey: ["bb-mission", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,status,submission_date,description,question_count,created_at")
        .eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["bb-members", missionId],
    queryFn: async () => (await supabase.from("mission_members").select("*").eq("mission_id", missionId)).data ?? [],
  });

  const { data: winThemes = [] } = useQuery({
    queryKey: ["bb-themes", missionId],
    queryFn: async () => (await supabase.from("win_themes").select("*").eq("mission_id", missionId).eq("status", "active")).data ?? [],
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["bb-questions", missionId],
    queryFn: async () => (await supabase
      .from("question_records")
      .select("id,question_number,title,health,status,current_score,target_score,pens_down_date,assigned_writer_id,assigned_sme_id")
      .eq("mission_id", missionId)
      .order("sort_order", { ascending: true })).data ?? [],
  });

  const { data: risks = [] } = useQuery({
    queryKey: ["bb-risks", missionId],
    queryFn: async () => (await supabase
      .from("mission_risks").select("*").eq("mission_id", missionId)
      .neq("status", "Closed").order("severity", { ascending: false })).data ?? [],
  });

  const { data: decisions = [] } = useQuery({
    queryKey: ["bb-decisions", missionId],
    queryFn: async () => (await supabase
      .from("mission_decisions").select("*").eq("mission_id", missionId)
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: assumptions = [] } = useQuery({
    queryKey: ["bb-assumptions", missionId],
    queryFn: async () => (await supabase
      .from("mission_assumptions").select("*").eq("mission_id", missionId)
      .order("status", { ascending: true })).data ?? [],
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ["bb-conflicts", missionId],
    queryFn: async () => (await supabase
      .from("alignment_conflicts").select("*").eq("mission_id", missionId)
      .is("resolved_at", null)).data ?? [],
  });

  const { data: signals = [] } = useQuery({
    queryKey: ["bb-signals", missionId],
    queryFn: async () => (await supabase
      .from("signals").select("id,signal_type,signal_title,signal_summary,severity,created_at")
      .eq("mission_id", missionId).eq("status", "open")
      .order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const days = mission?.submission_date
    ? Math.ceil((new Date(mission.submission_date).getTime() - Date.now()) / 86400000)
    : null;
  const greenCount = questions.filter((q: any) => q.health === "green").length;
  const yellowCount = questions.filter((q: any) => q.health === "yellow").length;
  const redCount = questions.filter((q: any) => q.health === "red").length;
  const scored = questions.filter((q: any) => q.current_score != null);
  const avgScore = scored.length
    ? (scored.reduce((s: number, q: any) => s + Number(q.current_score), 0) / scored.length).toFixed(2)
    : "—";

  return (
    <div className="bg-background min-h-screen">
      <style>{`@media print {
        .no-print { display: none !important; }
        .briefing-book { background: white !important; color: black !important; }
        .briefing-book * { color: black !important; border-color: #ccc !important; background: white !important; }
        .briefing-book h1, .briefing-book h2, .briefing-book h3 { page-break-after: avoid; }
        .briefing-book section { page-break-inside: avoid; }
      }`}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <BookOpen className="h-4 w-4" /> Briefing Book — compiled mission intelligence
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-surface-hover"
        >
          <Printer className="h-4 w-4" /> Print / Export PDF
        </button>
      </div>

      <article className="briefing-book mx-auto max-w-[860px] px-10 py-12 space-y-10 text-foreground">
        {/* Cover */}
        <section className="border-b border-border pb-8">
          <div className="text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">Briefing Book</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{mission?.name ?? "—"}</h1>
          <p className="mt-2 text-base text-muted-foreground">
            {mission?.client}{mission?.state ? ` · ${mission.state}` : ""}
          </p>
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm md:grid-cols-4">
            <Meta label="Health" value={mission?.health ?? "—"} />
            <Meta label="Status" value={mission?.status ?? "—"} />
            <Meta label="Submission" value={mission?.submission_date ? new Date(mission.submission_date).toLocaleDateString() : "—"} />
            <Meta label="Countdown" value={days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`} />
          </dl>
          <p className="mt-6 text-[11px] text-muted-foreground">
            Generated {new Date().toLocaleString()}
          </p>
        </section>

        {/* 1. Mission Overview */}
        <Sec title="1 · Mission Overview">
          {mission?.description ? (
            <p className="text-sm leading-relaxed">{mission.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No mission description provided.</p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <KPI label="Questions" value={questions.length} />
            <KPI label="Green" value={greenCount} />
            <KPI label="Yellow" value={yellowCount} />
            <KPI label="Red" value={redCount} />
            <KPI label="Avg Score" value={avgScore} />
          </div>
        </Sec>

        {/* 2. Team */}
        <Sec title="2 · Mission Team">
          {members.length === 0 ? <Empty>No team members.</Empty> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-1.5 pr-4">Name</th><th className="py-1.5">Role</th>
              </tr></thead>
              <tbody>
                {members.map((m: any) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="py-2 pr-4">{m.display_name ?? "—"}</td>
                    <td className="py-2 capitalize">{m.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sec>

        {/* 3. Win Themes */}
        <Sec title="3 · Win Themes">
          {winThemes.length === 0 ? <Empty>None defined.</Empty> : (
            <ul className="space-y-4">
              {winThemes.map((w: any) => (
                <li key={w.id} className="rounded-[8px] border border-border p-4">
                  <div className="text-base font-semibold">{w.title}</div>
                  {w.key_message && <p className="mt-1 text-sm italic text-foreground/90">"{w.key_message}"</p>}
                  {w.description && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{w.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Sec>

        {/* 4. Question Registry */}
        <Sec title="4 · Question Registry">
          {questions.length === 0 ? <Empty>No questions.</Empty> : (
            <table className="w-full text-xs">
              <thead><tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-1.5 pr-3">#</th>
                <th className="py-1.5 pr-3">Title</th>
                <th className="py-1.5 pr-3">Health</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3 text-right">Score</th>
                <th className="py-1.5 text-right">Pens Down</th>
              </tr></thead>
              <tbody>
                {questions.map((q: any) => (
                  <tr key={q.id} className="border-t border-border">
                    <td className="py-1.5 pr-3 font-mono text-muted-foreground">{q.question_number}</td>
                    <td className="py-1.5 pr-3">{q.title}</td>
                    <td className="py-1.5 pr-3 capitalize">{q.health}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{q.status?.replace("_", " ")}</td>
                    <td className="py-1.5 pr-3 text-right">{q.current_score ?? "—"}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{q.pens_down_date ? new Date(q.pens_down_date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Sec>

        {/* 5. Risks */}
        <Sec title="5 · Risks">
          {risks.length === 0 ? <Empty>No open risks.</Empty> : (
            <ul className="space-y-3">
              {risks.map((r: any) => (
                <li key={r.id} className="rounded-[8px] border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{r.title}</div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{r.severity} · {r.status}</span>
                  </div>
                  {r.description && <p className="mt-1 text-xs text-muted-foreground">{r.description}</p>}
                </li>
              ))}
            </ul>
          )}
        </Sec>

        {/* 6. Decisions */}
        <Sec title="6 · Decisions">
          {decisions.length === 0 ? <Empty>No decisions logged.</Empty> : (
            <ul className="space-y-3">
              {decisions.map((d: any) => (
                <li key={d.id} className="rounded-[8px] border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{d.title}</div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{d.status}</span>
                  </div>
                  {d.rationale && <p className="mt-1 text-xs text-muted-foreground">{d.rationale}</p>}
                </li>
              ))}
            </ul>
          )}
        </Sec>

        {/* 7. Assumptions */}
        <Sec title="7 · Assumptions">
          {assumptions.length === 0 ? <Empty>None recorded.</Empty> : (
            <ul className="space-y-3">
              {assumptions.map((a: any) => (
                <li key={a.id} className="rounded-[8px] border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm">{a.assumption}</div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{a.status}</span>
                  </div>
                  {a.risk_if_wrong && <p className="mt-1 text-xs text-muted-foreground">If wrong: {a.risk_if_wrong}</p>}
                </li>
              ))}
            </ul>
          )}
        </Sec>

        {/* 8. Alignment Conflicts */}
        <Sec title="8 · Open Alignment Conflicts">
          {conflicts.length === 0 ? <Empty>None open.</Empty> : (
            <ul className="space-y-3">
              {conflicts.map((c: any) => (
                <li key={c.id} className="rounded-[8px] border border-border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{c.conflict_type}</div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{c.severity}</span>
                  </div>
                  <p className="mt-1 text-xs">{c.description}</p>
                  {c.iris_recommendation && (
                    <p className="mt-2 text-xs text-muted-foreground"><span className="font-semibold">IRIS:</span> {c.iris_recommendation}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Sec>

        {/* 9. Recent Signals */}
        <Sec title="9 · Recent Signals">
          {signals.length === 0 ? <Empty>No open signals.</Empty> : (
            <ul className="space-y-2">
              {signals.map((s: any) => (
                <li key={s.id} className="flex items-start gap-2 border-b border-border pb-2 text-sm">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    s.severity === "critical" ? "bg-destructive" : s.severity === "warning" ? "bg-amber-400" : "bg-primary/60"
                  }`} />
                  <div className="flex-1">
                    <div>{s.signal_title}</div>
                    {s.signal_summary && <div className="text-xs text-muted-foreground">{s.signal_summary}</div>}
                  </div>
                  <span className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Sec>

        <footer className="border-t border-border pt-6 text-center text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          End of Briefing Book · {mission?.name}
        </footer>
      </article>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold tracking-tight border-b border-border pb-2">{title}</h2>
      {children}
    </section>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
function KPI({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-[8px] border border-border px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground italic">{children}</p>;
}
