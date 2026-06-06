import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";
import { AttentionBadge } from "@/components/v2/AttentionBadge";

export const Route = createFileRoute("/_authenticated/command/pens-down")({
  component: PensDownPage,
});

type Row = {
  id: string;
  mission_id: string;
  question_number: string;
  title: string;
  pens_down_date: string;
  health: "green" | "yellow" | "red" | null;
  current_score: number | null;
  status: string | null;
  assigned_writer_id: string | null;
};

type Profile = { id: string; display_name: string };

function daysUntil(date: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function rowColor(days: number, health: string | null): "red" | "yellow" | "green" {
  if (days <= 7 && health !== "green") return "red";
  if (days <= 14 && (health === "yellow" || health === "red")) return "yellow";
  return "green";
}

const colorClasses: Record<string, string> = {
  red: "bg-red-500/10 border-l-red-500 text-red-300",
  yellow: "bg-yellow-500/10 border-l-yellow-500 text-yellow-300",
  green: "bg-emerald-500/10 border-l-emerald-500 text-emerald-300",
};

const dotClasses: Record<string, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  green: "bg-emerald-500",
};

function PensDownPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["pens-down-watch"],
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("id,mission_id,question_number,title,pens_down_date,health,current_score,status,assigned_writer_id")
        .not("pens_down_date", "is", null)
        .order("pens_down_date", { ascending: true });
      return (data ?? []) as Row[];
    },
  });

  const writerIds = Array.from(new Set(rows.map((r) => r.assigned_writer_id).filter(Boolean))) as string[];

  const { data: profiles = [] } = useQuery({
    queryKey: ["pens-down-profiles", writerIds.sort().join(",")],
    enabled: writerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,display_name").in("id", writerIds);
      return (data ?? []) as Profile[];
    },
  });
  const writerMap = new Map(profiles.map((p) => [p.id, p.display_name]));

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Pens Down Watch</h1>
            <p className="text-sm text-muted-foreground">Questions sorted by upcoming pens-down deadline.</p>
          </div>
        </div>
        <AttentionBadge variant="compact" />
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Question</th>
              <th className="px-4 py-3">Pens Down</th>
              <th className="px-4 py-3">Days Left</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Writer</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No questions have a pens-down date set.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const days = daysUntil(r.pens_down_date);
              const color = rowColor(days, r.health);
              return (
                <tr
                  key={r.id}
                  className={`border-t border-border border-l-4 ${colorClasses[color]} hover:bg-muted/30 transition-colors`}
                >
                  <td className="px-4 py-3">
                    <Link
                      to="/missions/$missionId/sections/$questionId"
                      params={{ missionId: r.mission_id, questionId: r.id }}
                      className="text-foreground hover:underline"
                    >
                      <span className="font-mono text-xs text-muted-foreground mr-2">{r.question_number}</span>
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {new Date(r.pens_down_date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${dotClasses[r.health ?? "yellow"] ?? "bg-muted"}`} />
                      <span className="capitalize text-foreground">{r.health ?? "—"}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {r.current_score != null ? r.current_score.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-foreground">
                    {(r.status ?? "—").replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {r.assigned_writer_id ? writerMap.get(r.assigned_writer_id) ?? "—" : "Unassigned"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
