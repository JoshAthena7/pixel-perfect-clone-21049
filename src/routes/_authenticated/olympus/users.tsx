import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, UserCog } from "lucide-react";

export const Route = createFileRoute("/_authenticated/olympus/users")({
  component: UsersPage,
});

type Profile = { id: string; display_name: string | null; email: string | null; avatar_color: string | null; created_at: string | null };
type Membership = { user_id: string; role: string; mission: { id: string; name: string } | null };

function UsersPage() {
  const [search, setSearch] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["olympus-users-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,email,avatar_color,created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as Profile[];
    },
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ["olympus-users-memberships"],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("user_id,role,mission:missions!inner(id,name)");
      return (data ?? []) as unknown as Membership[];
    },
  });

  const byUser = useMemo(() => {
    const m = new Map<string, Membership[]>();
    for (const r of memberships) {
      if (!m.has(r.user_id)) m.set(r.user_id, []);
      m.get(r.user_id)!.push(r);
    }
    return m;
  }, [memberships]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) =>
      (p.display_name ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q),
    );
  }, [profiles, search]);

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Users</div>
          <h1 className="h1-display mt-1">All Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every person who has signed into Athena, with their mission memberships and roles.
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…"
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </header>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : visible.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <UserCog className="mx-auto mb-2 h-6 w-6 opacity-60" /> No users match.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Memberships</th>
                <th className="px-4 py-3 text-left w-32">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((p) => {
                const ms = byUser.get(p.id) ?? [];
                return (
                  <tr key={p.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                          style={{ background: p.avatar_color ?? "#3b7fff" }}
                        >
                          {(p.display_name ?? p.email ?? "?").slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.display_name ?? "Unnamed"}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {ms.length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">No missions</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {ms.map((m, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-hover px-2 py-0.5 text-[10px]">
                              <span className="font-medium">{m.mission?.name ?? m.user_id.slice(0,6)}</span>
                              <span className="text-muted-foreground">· {m.role}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground tabular-nums">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        To add or remove roles, open <span className="text-foreground">Olympus → Team</span> on the relevant mission.
      </p>
    </div>
  );
}
