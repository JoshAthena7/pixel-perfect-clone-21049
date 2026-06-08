import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { FastReportsMenu } from "@/components/olympus/FastReportsMenu";
import { supabase } from "@/integrations/supabase/client";

type MissionRow = {
  id: string;
  name: string;
  client: string | null;
  status: string | null;
  health: string | null;
  submission_date: string | null;
  created_at: string;
};

export default function MissionCommand() {
  const { data, isLoading } = useQuery({
    queryKey: ["olympus-missions"],
    queryFn: async () => {
      const { data: missions, error } = await supabase
        .from("missions")
        .select("id,name,client,status,health,submission_date,created_at")
        .order("submission_date", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const { data: intelRows } = await supabase
        .from("mission_intelligence")
        .select("mission_id");
      const counts = new Map<string, number>();
      for (const r of (intelRows ?? []) as { mission_id: string | null }[]) {
        if (!r.mission_id) continue;
        counts.set(r.mission_id, (counts.get(r.mission_id) ?? 0) + 1);
      }
      return { missions: (missions ?? []) as MissionRow[], counts };
    },
  });
  const missions = data?.missions ?? [];
  const counts = data?.counts ?? new Map<string, number>();

  return (
    <div className="flex-1 min-w-0">
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface/40 px-5">
        <div className="flex items-center gap-3">
          <h1 className="text-[12px] font-extrabold uppercase tracking-[0.32em]">
            Olympus · Mission Command
          </h1>
        </div>
        <FastReportsMenu />
      </header>

      <div className="p-5">
        <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <Th>Name</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Submission</Th>
                <Th>Health</Th>
                <Th>Readiness</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : missions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No missions yet.
                  </td>
                </tr>
              ) : (
                missions.map((m) => (
                  <tr key={m.id} className="border-t border-border/60 hover:bg-surface-hover/40">
                    <Td className="font-medium text-foreground">{m.name}</Td>
                    <Td>{m.client ?? "—"}</Td>
                    <Td><Badge value={m.status} /></Td>
                    <Td>{formatDate(m.submission_date)}</Td>
                    <Td><HealthDot value={m.health} /></Td>
                    <Td><IrisBadge count={counts.get(m.id) ?? 0} /></Td>
                    <Td className="text-right">
                      <div className="inline-flex gap-2">
                        <Link
                          to="/admin/missions/$missionId"
                          params={{ missionId: m.id }}
                          className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-hover"
                        >
                          Open
                        </Link>
                        <Link
                          to="/admin/missions/$missionId/setup"
                          params={{ missionId: m.id }}
                          className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs hover:bg-surface-hover"
                        >
                          Setup
                        </Link>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 text-left font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-middle ${className}`}>{children}</td>;
}

function Badge({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
      {value}
    </span>
  );
}

function IrisBadge({ count }: { count: number }) {
  const { label, cls } =
    count === 0
      ? { label: "No Intel", cls: "text-muted-foreground border-border" }
      : count <= 3
      ? { label: "Partial", cls: "text-amber-400 border-amber-400/40" }
      : { label: "IRIS Ready", cls: "text-emerald-400 border-emerald-400/40" };
  return (
    <span className={`inline-flex rounded border bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}


function HealthDot({ value }: { value: string | null }) {
  const v = (value ?? "").toLowerCase();
  const color =
    v === "green" ? "bg-emerald-500"
    : v === "yellow" ? "bg-amber-500"
    : v === "red" ? "bg-rose-500"
    : "bg-muted-foreground/40";
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="text-xs capitalize">{value ?? "unknown"}</span>
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}