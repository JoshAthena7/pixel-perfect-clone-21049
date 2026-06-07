import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight } from "lucide-react";
import { MissionProgressRing } from "@/components/MissionProgressRing";

export const Route = createFileRoute("/_authenticated/missions/")({
  ssr: false,
  component: AllMissionsPage,
});

type MissionRow = {
  id: string;
  name: string;
  client: string;
  status: string | null;
  health: string | null;
  submission_date: string | null;
  question_count: number | null;
  created_at: string | null;
};

function AllMissionsPage() {
  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["my-all-missions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [] as MissionRow[];
      const { data } = await supabase
        .from("missions")
        .select(
          "id,name,client,status,health,submission_date,question_count,created_at,mission_members!inner(user_id)"
        )
        .eq("mission_members.user_id", user.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as MissionRow[];
    },
  });

  const missionIds = missions.map((m) => m.id);
  const { data: completedByMission = {} } = useQuery({
    queryKey: ["my-missions-completed", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("question_records")
        .select("mission_id,status")
        .in("mission_id", missionIds)
        .in("status", ["approved", "submitted"]);
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ mission_id: string }>) {
        map[row.mission_id] = (map[row.mission_id] ?? 0) + 1;
      }
      return map;
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Missions</div>
        <h1 className="h1-display mt-1">All Missions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every mission you have access to. Open one to enter its Brief Room.
        </p>
      </header>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : missions.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            You don't have access to any missions yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Mission</th>
                  <th className="px-4 py-3 text-left w-24">Progress</th>
                  <th className="px-4 py-3 text-left w-28">Status</th>
                  <th className="px-4 py-3 text-left w-32">Submission</th>
                  <th className="px-4 py-3 text-left w-20">Health</th>
                  <th className="px-4 py-3 text-left w-32">Created</th>
                  <th className="px-4 py-3 text-right w-32">&nbsp;</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {missions.map((m) => {
                  const days = m.submission_date
                    ? Math.ceil((new Date(m.submission_date).getTime() - Date.now()) / 86400000)
                    : null;
                  const healthCls =
                    m.health?.toLowerCase() === "green"
                      ? "dot-green"
                      : m.health?.toLowerCase() === "red"
                      ? "dot-red"
                      : "dot-yellow";
                  return (
                    <tr key={m.id} className="hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <Link
                          to="/missions/$missionId/brief"
                          params={{ missionId: m.id }}
                          className="block group"
                          title="Open Mission Brief"
                        >
                          <div className="font-medium text-foreground group-hover:text-primary">{m.name}</div>
                          <div className="text-[11px] text-muted-foreground">{m.client}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <MissionProgressRing
                          size="sm"
                          completed={completedByMission[m.id] ?? 0}
                          total={m.question_count ?? 0}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip status={m.status} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {m.submission_date
                          ? `${new Date(m.submission_date).toLocaleDateString()} · ${
                              days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`
                            }`
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`dot ${healthCls}`} />
                      </td>
                      <td className="px-4 py-3 text-[11px] text-muted-foreground">
                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/missions/$missionId/brief"
                          params={{ missionId: m.id }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/10"
                        >
                          Open <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string | null }) {
  const s = status ?? "Draft";
  const cls =
    s === "Active"
      ? "bg-primary/15 text-primary"
      : s === "Pens Down"
      ? "bg-amber-500/15 text-amber-400"
      : s === "Submitted"
      ? "bg-emerald-500/15 text-emerald-400"
      : s === "Closed" || s === "Archived"
      ? "bg-muted text-muted-foreground"
      : "bg-surface text-muted-foreground border border-border";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${cls}`}>{s}</span>
  );
}
