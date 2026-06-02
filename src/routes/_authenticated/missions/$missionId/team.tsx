import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/missions/$missionId/team")({
  component: TeamPage,
});

function TeamPage() {
  const { missionId } = Route.useParams();

  const { data: members = [] } = useQuery({
    queryKey: ["team-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role")
        .eq("mission_id", missionId);
      return data ?? [];
    },
  });

  const ids = Array.from(new Set(members.map((m: any) => m.user_id).filter(Boolean)));
  const { data: profiles = [] } = useQuery({
    queryKey: ["team-profiles", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,email")
        .in("id", ids as string[]);
      return data ?? [];
    },
  });

  const rows = members.map((m: any) => ({
    ...m,
    profile: profiles.find((p: any) => p.id === m.user_id),
  }));

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-10 space-y-6">
      <header className="flex items-start justify-between gap-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Mission Team
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Team</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Roster, SMEs, leadership, and question assignments for this mission.
          </p>
        </div>
        <Link
          to="/missions/$missionId/settings"
          params={{ missionId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-hover hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" /> Manage access
        </Link>
      </header>

      <section className="rounded-[12px] border border-border bg-surface">
        <div className="border-b border-border px-5 py-3 flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Roster · {rows.length}
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No mission members yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r: any, i: number) => (
              <li key={`${r.user_id}-${r.role}-${i}`} className="flex items-center gap-3 px-5 py-3">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                  {(r.profile?.display_name || r.profile?.email || "?")
                    .split(/\s+/).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{r.profile?.display_name || r.profile?.email || r.user_id}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{r.profile?.email}</div>
                </div>
                <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {r.role}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        SME directory, assignment matrix, and access management will be wired in here in the next phase.
      </p>
    </div>
  );
}
