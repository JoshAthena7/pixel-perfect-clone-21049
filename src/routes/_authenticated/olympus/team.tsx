import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Trash2, Users as UsersIcon } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/olympus/team")({
  component: TeamPage,
});

const ROLES = ["admin", "lead", "writer", "sme", "reviewer", "observer"] as const;
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

  if (!missionId) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-16 text-center text-sm text-muted-foreground">
        Select a mission from the header to manage its team.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Team</div>
        <h1 className="h1-display mt-1">Manage Mission Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite members, change roles, and remove access for this mission.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <Roster missionId={missionId} />
        <InvitePanel missionId={missionId} />
      </div>
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

function InvitePanel({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("writer");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; email: string | null; display_name: string | null }> | null>(null);

  async function search(q: string) {
    setEmail(q);
    if (q.trim().length < 2) { setResults(null); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id,email,display_name")
      .or(`email.ilike.%${q}%,display_name.ilike.%${q}%`)
      .limit(8);
    setResults(data ?? []);
  }

  async function invite(userId: string, label: string) {
    setBusy(true);
    const { data: existing } = await supabase
      .from("mission_members")
      .select("id")
      .eq("mission_id", missionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) { toast.message(`${label} is already on this mission`); setBusy(false); return; }

    const { error } = await supabase.from("mission_members").insert({
      mission_id: missionId,
      user_id: userId,
      role,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Added ${label} as ${role}`);
    await logOlympusAction({
      action_type: "team.add",
      action_summary: `Added ${label} as ${role}`,
      mission_id: missionId,
      target_table: "mission_members",
    });
    setEmail("");
    setResults(null);
    qc.invalidateQueries({ queryKey: ["olympus-team", missionId] });
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <UserPlus className="h-4 w-4 text-muted-foreground" /> Invite member
      </div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Role</label>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      >
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>

      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Find by email or name</label>
      <input
        value={email}
        onChange={(e) => search(e.target.value)}
        placeholder="josh@athenama.com"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {results && (
        <div className="mt-2 rounded-md border border-border bg-background max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No matching profile. The user must sign in once before you can invite them.
            </div>
          ) : results.map((r) => (
            <button
              key={r.id}
              disabled={busy}
              onClick={() => invite(r.id, r.display_name ?? r.email ?? "user")}
              className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-hover disabled:opacity-50"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{r.display_name ?? r.email}</div>
                <div className="truncate text-[11px] text-muted-foreground">{r.email}</div>
              </div>
              <span className="text-[11px] text-primary">Add</span>
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Members must have signed in to Athena at least once to appear in search. Bulk-invite pastes below add them in one click.
      </p>

      <BulkInvitePanel missionId={missionId} defaultRole={role} />
    </div>
  );
}

function BulkInvitePanel({ missionId, defaultRole }: { missionId: string; defaultRole: Role }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [role, setRole] = useState<Role>(defaultRole);
  const [busy, setBusy] = useState(false);

  async function process() {
    const emails = Array.from(new Set(
      text.split(/[\n,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
    ));
    if (emails.length === 0) { toast.error("Paste one or more valid email addresses"); return; }
    setBusy(true);
    let added = 0, skipped = 0, missing = 0;
    for (const email of emails) {
      const { data: prof } = await supabase.from("profiles").select("id,email").eq("email", email).maybeSingle();
      if (!prof) { missing++; continue; }
      const { data: existing } = await supabase.from("mission_members").select("id").eq("mission_id", missionId).eq("user_id", prof.id).maybeSingle();
      if (existing) { skipped++; continue; }
      const { error } = await supabase.from("mission_members").insert({ mission_id: missionId, user_id: prof.id, role });
      if (!error) {
        added++;
        await logOlympusAction({
          action_type: "team.add",
          action_summary: `Bulk-added ${email} as ${role}`,
          mission_id: missionId,
          target_table: "mission_members",
        });
      }
    }
    setBusy(false);
    toast.success(`Added ${added}, skipped ${skipped}, no profile ${missing}`);
    if (added > 0) {
      setText("");
      qc.invalidateQueries({ queryKey: ["olympus-team", missionId] });
    }
  }

  return (
    <div className="mt-4 rounded-[10px] border border-border bg-surface p-5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-muted-foreground" /> Bulk invite</span>
        <span className="text-[11px] text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder={"Paste emails — one per line\nteammate1@firm.com\nteammate2@firm.com"}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono" />
          <button onClick={process} disabled={busy}
            className="w-full rounded-md bg-[#C49A22] px-3 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? "Inviting…" : "Send All Invitations"}
          </button>
          <p className="text-[11px] text-muted-foreground">
            Users without an Athena profile yet are reported as "no profile" — ask them to sign in once, then re-run.
          </p>
        </div>
      )}
    </div>
  );
}
