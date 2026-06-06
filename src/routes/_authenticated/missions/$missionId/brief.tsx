import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, AlertTriangle, Target, TrendingUp, FileText, Gauge, Trophy, Activity } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/useAccess";


export const Route = createFileRoute("/_authenticated/missions/$missionId/brief")({
  component: BriefPage,
});

function BriefPage() {
  const { missionId } = Route.useParams();

  const { data: mission } = useQuery({
    queryKey: ["mission", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name,client,state,status,health,submission_date,description,program_type,win_themes,priority_topics,competitors,state_agency,procurement_name,rfp_number,focus_areas").eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: questions = [] } = useQuery({
    queryKey: ["mission-questions-brief", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,title,health,status,current_score,target_score,pens_down_date")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const { data: conflicts = [] } = useQuery({
    queryKey: ["mission-conflicts-brief", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("alignment_conflicts")
        .select("id,severity,description,iris_recommendation")
        .eq("mission_id", missionId)
        .is("resolved_at", null);
      return data ?? [];
    },
  });

  const { data: themes = [] } = useQuery({
    queryKey: ["mission-themes-brief", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,key_message,status")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const total = questions.length;
    const green = questions.filter((q: any) => q.health === "green").length;
    const yellow = questions.filter((q: any) => q.health === "yellow").length;
    const red = questions.filter((q: any) => q.health === "red").length;
    const scored = questions.filter((q: any) => q.current_score != null);
    const avg = scored.length ? scored.reduce((s: number, q: any) => s + Number(q.current_score), 0) / scored.length : 0;
    const belowTarget = questions.filter((q: any) => q.current_score != null && q.target_score != null && Number(q.current_score) < Number(q.target_score)).length;
    return { total, green, yellow, red, avg, belowTarget };
  }, [questions]);

  const topRisks = useMemo(() => {
    return questions
      .filter((q: any) => q.health === "red" || q.health === "yellow")
      .sort((a: any, b: any) => (a.health === "red" ? -1 : 1) - (b.health === "red" ? -1 : 1))
      .slice(0, 5);
  }, [questions]);

  const [snapOpen, setSnapOpen] = useState(false);
  const { isAdmin } = useIsAdmin();


  const { data: oracleInsights = [] } = useQuery({
    queryKey: ["brief-oracle-insights", missionId],
    enabled: snapOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("atlas_knowledge_objects")
        .select("id,title,body,topic_category,proposal_use_case,knowledge_layer")
        .or(`mission_id.eq.${missionId},knowledge_layer.eq.collective`)
        .or("topic_category.ilike.%win%,proposal_use_case.ilike.%win%,topic_category.ilike.%differentiat%")
        .limit(5);
      return data ?? [];
    },
  });

  const overallHealth = stats.red > 0 ? "red" : stats.yellow > 0 ? "yellow" : "green";

  return (
    <div className="px-8 py-8 max-w-5xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary/10 text-primary">
            <Sparkles className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">IRIS Mission Brief</h1>
            <p className="text-xs text-muted-foreground">Executive summary auto-generated from mission signals.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin ? (
            <Link
              to="/command/health"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 h-9 text-sm font-medium hover:bg-surface-hover"
            >
              <Activity className="h-4 w-4" /> Health
            </Link>
          ) : null}
          <Dialog open={snapOpen} onOpenChange={setSnapOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Gauge className="h-4 w-4" /> Quick Snapshot
              </Button>
            </DialogTrigger>

          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" /> Mission Snapshot
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5">
              {/* Health */}
              <div className="rounded-[10px] border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Project Health</div>
                    <div className="mt-1 text-lg font-semibold">{mission?.name ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`dot dot-${overallHealth}`} />
                    <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{overallHealth}</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <MiniStat label="Sections" value={stats.total} />
                  <MiniStat label="Avg Score" value={stats.avg ? stats.avg.toFixed(2) : "—"} />
                  <MiniStat label="Below Tgt" value={stats.belowTarget} tone={stats.belowTarget > 0 ? "warn" : undefined} />
                  <MiniStat label="Conflicts" value={conflicts.length} tone={conflicts.length > 0 ? "danger" : undefined} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <HealthChip color="green" count={stats.green} label="Green" />
                  <HealthChip color="yellow" count={stats.yellow} label="Yellow" />
                  <HealthChip color="red" count={stats.red} label="Red" />
                </div>
              </div>

              {/* Win themes */}
              <div className="rounded-[10px] border border-border bg-surface p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">High-Level Win Themes</div>
                </div>
                {themes.length === 0 && oracleInsights.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No win themes yet. Define them in the Win Themes section or capture them in the Oracle.</p>
                ) : (
                  <ul className="space-y-2">
                    {themes.slice(0, 5).map((t: any) => (
                      <li key={t.id} className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="text-sm font-medium">{t.title}</div>
                        {t.key_message && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{t.key_message}</div>}
                      </li>
                    ))}
                    {oracleInsights.slice(0, 5 - Math.min(themes.length, 5)).map((o: any) => (
                      <li key={o.id} className="rounded-md border border-dashed border-border bg-background px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] uppercase tracking-[0.14em] text-primary">Oracle</span>
                          <div className="text-sm font-medium">{o.title ?? o.topic_category ?? "Insight"}</div>
                        </div>
                        {o.body && <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{o.body}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>


      {/* Headline */}
      <div className="rounded-[10px] border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Mission</div>
            <div className="mt-1 text-lg font-semibold">{mission?.name ?? "—"}</div>
            <div className="mt-1 text-sm text-muted-foreground">{mission?.client ?? "—"}{mission?.state ? ` · ${mission.state}` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`dot dot-${mission?.health ?? "green"}`} />
            <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{mission?.status ?? "—"}</span>
          </div>
        </div>
        {mission?.description && (
          <p className="mt-4 text-sm text-foreground/90 leading-relaxed">{mission.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <Stat label="Questions" value={stats.total} icon={<FileText className="h-4 w-4" />} />
        <Stat label="Weighted Avg" value={stats.avg ? stats.avg.toFixed(2) : "—"} icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Below Target" value={stats.belowTarget} icon={<Target className="h-4 w-4" />} tone={stats.belowTarget > 0 ? "warn" : undefined} />
        <Stat label="Open Conflicts" value={conflicts.length} icon={<AlertTriangle className="h-4 w-4" />} tone={conflicts.length > 0 ? "danger" : undefined} />
      </div>

      {/* Health */}
      <Section title="Question Health">
        {stats.total === 0 ? (
          <Empty title="No questions yet." sub="Upload the RFP from the library to auto-create question records." />
        ) : (
          <div className="flex items-center gap-2 px-6 py-5">
            <HealthChip color="green" count={stats.green} label="Green" />
            <HealthChip color="yellow" count={stats.yellow} label="Yellow" />
            <HealthChip color="red" count={stats.red} label="Red" />
          </div>
        )}
      </Section>

      {/* IRIS Risk Synthesis */}
      <Section title="Top Risks — IRIS Synthesis">
        {topRisks.length === 0 ? (
          <Empty title="No risk signals." sub="Health is clean across all questions. Keep monitoring." />
        ) : (
          <ul className="divide-y divide-border">
            {topRisks.map((q: any) => (
              <li key={q.id} className="flex items-center gap-3 px-6 py-3">
                <span className={`dot dot-${q.health}`} />
                <span className="font-mono text-xs text-muted-foreground w-12">{q.question_number}</span>
                <Link
                  to="/missions/$missionId/sections/$questionId"
                  params={{ missionId, questionId: q.id }}
                  className="flex-1 text-sm hover:text-primary"
                >
                  {q.title}
                </Link>
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{q.status?.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Conflicts */}
      <Section title="Alignment Conflicts">
        {conflicts.length === 0 ? (
          <Empty title="No open conflicts." sub="IRIS hasn't detected misalignment across questions." />
        ) : (
          <ul className="divide-y divide-border">
            {conflicts.slice(0, 5).map((c: any) => (
              <li key={c.id} className="px-6 py-3">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                    c.severity === "critical" ? "bg-destructive/15 text-destructive" :
                    c.severity === "warning" ? "bg-yellow-500/15 text-yellow-500" :
                    "bg-muted text-muted-foreground"
                  }`}>{c.severity ?? "info"}</span>
                  <span className="text-sm">{c.description}</span>
                </div>
                {c.iris_recommendation && (
                  <p className="mt-1 ml-1 text-xs text-muted-foreground">IRIS: {c.iris_recommendation}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Win themes */}
      <Section title="Win Themes">
        {themes.length === 0 ? (
          <Empty title="No win themes defined." sub="Define the messages your proposal must land on to differentiate." />
        ) : (
          <ul className="divide-y divide-border">
            {themes.map((t: any) => (
              <li key={t.id} className="px-6 py-3">
                <div className="text-sm font-medium">{t.title}</div>
                {t.key_message && <div className="mt-0.5 text-xs text-muted-foreground">{t.key_message}</div>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: "warn" | "danger" }) {
  const toneCls = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-yellow-500" : "text-foreground";
  return (
    <div className="rounded-[10px] border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10px] uppercase tracking-[0.14em]">{label}</span>
        {icon}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function HealthChip({ color, count, label }: { color: "green" | "yellow" | "red"; count: number; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5">
      <span className={`dot dot-${color}`} />
      <span className="text-sm font-medium">{count}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="p-10 text-center">
      <p className="text-sm text-foreground/90">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" | "danger" }) {
  const toneCls = tone === "danger" ? "text-destructive" : tone === "warn" ? "text-yellow-500" : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-1 text-base font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}
