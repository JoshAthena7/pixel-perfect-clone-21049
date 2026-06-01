import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, AlertCircle, Activity } from "lucide-react";
import { signalTypeLabel, relativeTime } from "@/lib/signals";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

type Signal = {
  id: string;
  mission_id: string;
  signal_type: string;
  signal_title: string;
  signal_summary: string | null;
  severity: "info" | "warning" | "critical";
  created_at: string;
  related_question_id: string | null;
};

function HomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-brief"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
      const { data: questions = [] } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,health,pens_down_date")
        .or(`assigned_writer_id.eq.${user!.id},assigned_sme_id.eq.${user!.id}`)
        .neq("health", "green")
        .order("pens_down_date", { ascending: true, nullsFirst: false })
        .limit(10);
      return { name: profile?.display_name ?? "there", questions: questions ?? [] };
    },
  });

  const { data: pulse } = useQuery({
    queryKey: ["iris-brief-signals"],
    queryFn: async () => {
      // RLS scopes to missions the user belongs to.
      const { data: critical = [] } = await supabase
        .from("signals")
        .select("id,mission_id,signal_type,signal_title,signal_summary,severity,created_at,related_question_id")
        .eq("status", "open")
        .eq("severity", "critical")
        .order("created_at", { ascending: false })
        .limit(3);
      let combined = (critical ?? []) as Signal[];
      if (combined.length < 3) {
        const { data: warn = [] } = await supabase
          .from("signals")
          .select("id,mission_id,signal_type,signal_title,signal_summary,severity,created_at,related_question_id")
          .eq("status", "open")
          .eq("severity", "warning")
          .order("created_at", { ascending: false })
          .limit(3 - combined.length);
        combined = [...combined, ...((warn ?? []) as Signal[])];
      }
      return combined;
    },
    refetchInterval: 30_000,
  });

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="mx-auto max-w-4xl px-8 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {isLoading ? "Loading…" : `Good morning, ${data?.name}.`}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{today}</p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your Questions Today</h2>
        <div className="rounded-[10px] border border-border bg-surface">
          {data?.questions.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nothing assigned to you needs attention right now.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data?.questions.map((q: any) => (
                <li key={q.id}>
                  <Link
                    to="/missions/$missionId/questions/$questionId"
                    params={{ missionId: q.mission_id, questionId: q.id }}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover transition-colors"
                  >
                    <span className={`dot dot-${q.health}`} />
                    <span className="w-16 text-sm font-mono text-muted-foreground">{q.question_number}</span>
                    <span className="flex-1 text-sm">{q.title}</span>
                    {q.pens_down_date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(q.pens_down_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-[10px] border border-border bg-surface p-6">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">IRIS Brief</h2>
        </div>
        {!pulse || pulse.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            No critical or warning signals across your missions. IRIS is quiet — good time to push work forward.
          </p>
        ) : (
          <ul className="space-y-3">
            {pulse.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-[8px] border border-border bg-background p-3">
                <SeverityIcon severity={s.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${
                      s.severity === "critical" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-400"
                    }`}>
                      {signalTypeLabel(s.signal_type)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{relativeTime(s.created_at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{s.signal_title}</p>
                  {s.signal_summary && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.signal_summary}</p>
                  )}
                </div>
                {s.related_question_id && (
                  <Link
                    to="/missions/$missionId/questions/$questionId"
                    params={{ missionId: s.mission_id, questionId: s.related_question_id }}
                    className="shrink-0 text-[11px] text-primary hover:underline"
                  >
                    Open →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === "critical") return <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (severity === "warning") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />;
  return <Activity className="h-4 w-4 shrink-0 text-muted-foreground" />;
}
