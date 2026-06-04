import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Users as UsersIcon } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";
import { EmptyState, EmptyIcon } from "@/components/v2/EmptyState";
import { CollectivePanel } from "@/components/olympus/CollectivePanel";

export const Route = createFileRoute("/_authenticated/olympus/team")({
  component: TeamPage,
});

const ROLES = ["admin", "lead", "writer", "sme", "viewer"] as const;
type Role = (typeof ROLES)[number];

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  display_name: string | null;
  joined_at: string | null;
  profile: { display_name: string | null; email: string | null; avatar_color: string | null } | null;
};

function TeamPage() {
  const missionId = useSelectedOlympusMission();

  return (
    <div className="mx-auto max-w-7xl px-8 py-8 space-y-8">
      <header>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Team</div>
        <h1 className="h1-display mt-1">Manage Mission Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review the mission roster, then add people from the Athena Collective with the right role for this mission.
        </p>
      </header>

      {missionId ? (
        <div className="space-y-6">
          <Roster missionId={missionId} />
          <CollectivePanel missionId={missionId} />
        </div>
      ) : (
        <div className="rounded-[10px] border border-dashed border-border bg-surface px-6 py-4 text-sm text-muted-foreground">
          Select a mission from the header to manage its roster. The Athena Collective directory below is shared across all missions.
        </div>
      )}
    </div>
  );
}

function Roster({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["olympus-team", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("id,user_id,role,display_name,joined_at, profile:profiles!mission_members_user_id_fkey(display_name,email,avatar_color)")
        .eq("mission_id", missionId)
        .order("joined_at", { ascending: true });
      // The FK alias may not exist; fall back to a manual join.
      if (!data || (data[0] && !(data[0] as any).profile)) {
        const { data: raw } = await supabase
          .from("mission_members")
          .select("id,user_id,role,display_name,joined_at")
          .eq("mission_id", missionId)
          .order("joined_at", { ascending: true });
        const ids = (raw ?? []).map((r) => r.user_id);
        const { data: profs } = ids.length
          ? await supabase.from("profiles").select("id,display_name,email,avatar_color").in("id", ids)
          : { data: [] as any[] };
        const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
        return (raw ?? []).map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null })) as MemberRow[];
      }
      return data as unknown as MemberRow[];
    },
  });

  async function updateRole(m: MemberRow, role: Role) {
    const { error } = await supabase.from("mission_members").update({ role }).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success(`${m.profile?.display_name ?? m.display_name ?? "Member"} is now ${role}`);
    await logOlympusAction({
      action_type: "team.role_change",
      action_summary: `Changed role to ${role} for ${m.profile?.email ?? m.user_id}`,
      mission_id: missionId,
      target_table: "mission_members",
      target_id: m.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-team", missionId] });
  }

  async function remove(m: MemberRow) {
    const name = m.profile?.display_name ?? m.profile?.email ?? "this member";
    if (!confirm(`Remove ${name} from the mission?`)) return;
    const { error } = await supabase.from("mission_members").delete().eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("Member removed");
    await logOlympusAction({
      action_type: "team.remove",
      action_summary: `Removed ${m.profile?.email ?? m.user_id} from mission`,
      mission_id: missionId,
      target_table: "mission_members",
      target_id: m.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-team", missionId] });
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UsersIcon className="h-4 w-4 text-muted-foreground" /> Roster <span className="text-xs text-muted-foreground">({members.length})</span>
        </div>
      </div>
      {isLoading ? (
        <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={<EmptyIcon name="people" />}
          title="No team assigned yet."
          description="Invite someone from the panel on the right to staff this mission."
        />
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left w-44">Role</th>
              <th className="px-4 py-3 text-left w-32">Joined</th>
              <th className="px-4 py-3 text-right w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-surface-hover">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                      style={{ background: m.profile?.avatar_color ?? "#3b7fff" }}
                    >
                      {(m.profile?.display_name ?? m.profile?.email ?? "?").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.profile?.display_name ?? m.display_name ?? "Unnamed"}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{m.profile?.email ?? m.user_id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={m.role}
                    onChange={(e) => updateRole(m, e.target.value as Role)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-[11px] text-muted-foreground">
                  {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(m)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    title="Remove from mission"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
