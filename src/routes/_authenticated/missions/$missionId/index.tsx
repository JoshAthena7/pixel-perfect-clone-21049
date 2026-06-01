import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/missions/$missionId/")({
  component: QuestionCommand,
});

function QuestionCommand() {
  const { missionId } = Route.useParams();
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["mission-questions", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,question_number,section_number,title,health,status,pens_down_date,current_score,page_limit")
        .eq("mission_id", missionId)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
  });

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Question Command</h1>
        <div className="text-xs text-muted-foreground">Bulk actions, RFP upload, and add-question modal arrive in the next phase.</div>
      </div>
      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading questions…</div>
        ) : questions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-foreground/90">No questions yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Upload the RFP to auto-create question records, or add questions manually.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left w-8" />
                <th className="px-4 py-3 text-left">Question</th>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Score</th>
                <th className="px-4 py-3 text-right">Pens Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {questions.map((q: any) => (
                <tr key={q.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3"><span className={`dot dot-${q.health}`} /></td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    <Link to="/missions/$missionId/questions/$questionId" params={{ missionId, questionId: q.id }} className="hover:text-primary">
                      {q.question_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link to="/missions/$missionId/questions/$questionId" params={{ missionId, questionId: q.id }} className="hover:text-primary">
                      {q.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{q.status.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-right">{q.current_score ? <span className="text-primary font-semibold">{q.current_score}</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{q.pens_down_date ? new Date(q.pens_down_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
