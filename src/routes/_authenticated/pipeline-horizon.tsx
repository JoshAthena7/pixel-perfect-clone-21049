import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/pipeline-horizon")({
  component: PipelineHorizon,
});

type Mission = {
  id: string;
  name: string;
  client: string;
  state: string | null;
  health: "Green" | "Yellow" | "Red";
  submission_date: string | null;
};

function PipelineHorizon() {
  const { data: pipeline = [] } = useQuery({
    queryKey: ["pipeline-horizon"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,state,health,submission_date")
        .eq("status", "Active")
        .order("submission_date", { ascending: true });
      return (data ?? []) as Mission[];
    },
  });

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <div className="mb-6 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5 text-primary" /> Pipeline Horizon
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Active missions by deadline</h1>
      <p className="mt-2 text-sm text-muted-foreground">Firm-wide view of every active procurement, ordered by submission date.</p>

      <section className="mt-8 rounded-[12px] border border-border bg-surface">
        <ul className="divide-y divide-border">
          {pipeline.length === 0 && (
            <li className="px-5 py-10 text-center text-sm text-muted-foreground">No active missions in pipeline.</li>
          )}
          {pipeline.map((m) => {
            const d = m.submission_date
              ? Math.ceil((new Date(m.submission_date).getTime() - Date.now()) / 86400000)
              : null;
            const tone = d === null ? "text-muted-foreground" : d <= 7 ? "text-destructive" : d <= 21 ? "text-amber-400" : "text-foreground";
            const dotCls = m.health === "Green" ? "dot dot-green" : m.health === "Red" ? "dot dot-red" : "dot dot-yellow";
            const risk = d === null ? null : d <= 7 ? "High" : d <= 21 ? "Medium" : "Low";
            const riskPill = risk === "High" ? "pill-red" : risk === "Medium" ? "pill-yellow" : "pill-green";
            return (
              <li key={m.id} className="px-3 py-2">
                <Link
                  to="/missions/$missionId/overview"
                  params={{ missionId: m.id }}
                  className="flex items-center gap-4 rounded-[8px] px-3 py-3 transition-colors hover:bg-surface-hover"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={dotCls} />
                      <div className="truncate text-sm font-semibold">{m.name}</div>
                    </div>
                    <div className="mt-0.5 truncate pl-4 text-[11px] text-muted-foreground">{m.client}{m.state ? ` · ${m.state}` : ""}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-semibold tabular-nums leading-none ${tone}`}>
                      {d === null ? "—" : Math.abs(d)}
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                      {d === null ? "" : d < 0 ? "d overdue" : "days"}
                    </div>
                  </div>
                  {risk && <span className={`pill ${riskPill}`}>{risk} Risk</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
