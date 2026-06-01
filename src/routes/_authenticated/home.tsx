import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/home")({
  component: HomePage,
});

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
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">IRIS Brief</h2>
        <p className="text-sm leading-relaxed text-foreground/90">
          IRIS streaming brief activates when the IRIS edge function is connected in the next phase. For now,
          review your questions above and head into a mission to start working.
        </p>
      </section>
    </div>
  );
}
