import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { inviteMissionMember } from "@/lib/mission-members.functions";
import { Save, Plus, Trash2, X, UserPlus, Pencil, Archive, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/settings")({
  component: SettingsPage,
});

const STATUSES = ["Active", "Won", "Lost", "Withdrawn", "On Hold", "Archived"] as const;
const HEALTHS = ["green", "yellow", "red"] as const;
const ROLES = ["admin", "lead", "writer", "sme", "viewer"] as const;
type Role = (typeof ROLES)[number];

type Tab = "details" | "gates" | "team" | "themes";

function SettingsPage() {
  const { missionId } = Route.useParams();
  const [tab, setTab] = useState<Tab>("details");

  return (
    <div className="px-8 py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Mission Settings</h1>
        <p className="mt-1 text-xs text-muted-foreground">Configure core details, review gates, and team access.</p>
      </div>

      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {([
          ["details", "Details"],
          ["gates", "Review Gates"],
          ["team", "Team"],
          ["themes", "Win Themes"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative px-4 py-2.5 text-sm transition ${
              tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "details" && <DetailsTab missionId={missionId} />}
      {tab === "gates" && <GatesTab missionId={missionId} />}
      {tab === "team" && <TeamTab missionId={missionId} />}
      {tab === "themes" && <ThemesTab missionId={missionId} />}
    </div>
  );
}

const inputCls =
  "w-full rounded-[8px] border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1.5 ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/* ─── Tab 1: Details ────────────────────────────── */

function DetailsTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const { data: mission, isLoading } = useQuery({
    queryKey: ["mission", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("*").eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const [form, setForm] = useState({
    name: "", client: "", state: "", status: "Active", health: "green",
    submission_date: "", description: "", slack_webhook: "",
  });

  useEffect(() => {
    if (mission) {
      setForm({
        name: mission.name ?? "",
        client: mission.client ?? "",
        state: mission.state ?? "",
        status: mission.status ?? "Active",
        health: mission.health ?? "green",
        submission_date: mission.submission_date ?? "",
        description: mission.description ?? "",
        slack_webhook: mission.slack_webhook ?? "",
      });
    }
  }, [mission]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("missions").update({
        name: form.name,
        client: form.client,
        state: form.state || null,
        status: form.status,
        health: form.health,
        submission_date: form.submission_date || null,
        description: form.description || null,
        slack_webhook: form.slack_webhook || null,
      }).eq("id", missionId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", missionId] }),
  });

  if (isLoading) return <div className="py-12 text-sm text-muted-foreground">Loading mission…</div>;
  if (!mission) return <div className="py-12 text-sm text-muted-foreground">Mission not found.</div>;

  const isClosed = ["Won", "Lost", "Withdrawn", "Archived"].includes(form.status);

  return (
    <div>
      {/* ARCH-6: lifecycle banner */}
      {isClosed && (
        <div className="mb-4 rounded-[10px] border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
          This mission is marked <span className="font-semibold">{form.status}</span>. It will stay
          visible in the Olympus archive but is no longer counted as Active in The Atrium or sidebar.
        </div>
      )}
      <div className="rounded-[10px] border border-border bg-surface p-6">
        <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Core</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mission Name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Client"><input className={inputCls} value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} /></Field>
          <Field label="State"><input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
          <Field label="Submission Date"><input type="date" className={inputCls} value={form.submission_date} onChange={(e) => setForm({ ...form, submission_date: e.target.value })} /></Field>
          <Field label="Status">
            <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Health">
            <select className={inputCls} value={form.health} onChange={(e) => setForm({ ...form, health: e.target.value })}>
              {HEALTHS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </Field>
          <Field label="Description" full><textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </div>

      <div className="mt-6 rounded-[10px] border border-border bg-surface p-6">
        <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Integrations</h2>
        <Field label="Slack Webhook URL">
          <input className={inputCls} placeholder="https://hooks.slack.com/services/…" value={form.slack_webhook} onChange={(e) => setForm({ ...form, slack_webhook: e.target.value })} />
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-between">
        {save.isError && <p className="text-xs text-destructive">{(save.error as Error).message}</p>}
        {save.isSuccess && <p className="text-xs text-muted-foreground">Saved.</p>}
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="ml-auto inline-flex items-center gap-2 rounded-[8px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

/* ─── Tab 2: Review Gates ────────────────────────── */

type Gate = { id: string; gate_name: string; gate_order: number; target_date: string | null; description: string | null };

function GatesTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const { data: gates = [], isLoading } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("mission_review_gates").select("*").eq("mission_id", missionId).order("gate_order", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });

  const deleteGate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mission_review_gates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-gates", missionId] }),
  });

  const reorder = useMutation({
    mutationFn: async (next: Gate[]) => {
      await Promise.all(
        next.map((g, i) =>
          supabase.from("mission_review_gates").update({ gate_order: i + 1 }).eq("id", g.id),
        ),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-gates", missionId] }),
  });

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) return;
    const next = [...gates];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    setDragIdx(null);
    reorder.mutate(next);
  }

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Review Gates</h2>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover">
          <Plus className="h-3.5 w-3.5" /> Add Gate
        </button>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : gates.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-foreground/90">No review gates configured.</p>
          <p className="mt-1 text-xs text-muted-foreground">Add gates like Pink Team, Red Team, and Gold Team to track review cycles.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left w-16">Order</th>
              <th className="px-4 py-3 text-left">Gate</th>
              <th className="px-4 py-3 text-left w-36">Target Date</th>
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {gates.map((g, i) => (
              <tr
                key={g.id}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(i)}
                className={`hover:bg-surface-hover ${dragIdx === i ? "opacity-50" : ""}`}
              >
                <td className="px-4 py-3 font-mono text-muted-foreground cursor-grab">⋮⋮ {g.gate_order}</td>
                <td className="px-4 py-3 font-medium">{g.gate_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{g.target_date ? new Date(g.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{g.description ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteGate.mutate(g.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <AddGateModal
          missionId={missionId}
          defaultOrder={gates.length + 1}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

function AddGateModal({ missionId, defaultOrder, onClose }: { missionId: string; defaultOrder: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ gate_name: "", gate_order: defaultOrder, target_date: "", description: "" });
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("mission_review_gates").insert({
        mission_id: missionId,
        gate_name: form.gate_name,
        gate_order: form.gate_order,
        target_date: form.target_date || null,
        description: form.description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mission-gates", missionId] });
      onClose();
    },
  });

  return (
    <ModalShell title="Add Review Gate" onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Gate Name"><input className={inputCls} value={form.gate_name} onChange={(e) => setForm({ ...form, gate_name: e.target.value })} placeholder="Pink Team" /></Field>
        <Field label="Order"><input type="number" min={1} className={inputCls} value={form.gate_order} onChange={(e) => setForm({ ...form, gate_order: Number(e.target.value) })} /></Field>
        <Field label="Target Date"><input type="date" className={inputCls} value={form.target_date} onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></Field>
        <Field label="Description"><textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      </div>
      {add.isError && <p className="mt-3 text-xs text-destructive">{(add.error as Error).message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-[8px] border border-border px-3 py-2 text-sm hover:bg-surface-hover">Cancel</button>
        <button
          disabled={!form.gate_name || add.isPending}
          onClick={() => add.mutate()}
          className="rounded-[8px] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {add.isPending ? "Adding…" : "Add gate"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Tab 3: Team ────────────────────────────── */

type Member = {
  id: string;
  user_id: string;
  role: Role;
  display_name: string | null;
  joined_at: string | null;
};
type ProfileLite = { id: string; display_name: string; email: string | null };

function TeamTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["mission-members", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("id,user_id,role,display_name,joined_at")
        .eq("mission_id", missionId)
        .order("joined_at", { ascending: true });
      return (data ?? []) as Member[];
    },
  });

  const ids = members.map((m) => m.user_id);
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-batch", ids],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const { data } = await supabase.from("profiles").select("id,display_name,email").in("id", ids);
      return (data ?? []) as ProfileLite[];
    },
    enabled: ids.length > 0,
  });

  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const updateRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) => {
      const { error } = await supabase.from("mission_members").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-members", missionId] }),
  });

  const removeMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mission_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-members", missionId] }),
  });

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Team Members</h2>
        <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover">
          <UserPlus className="h-3.5 w-3.5" /> Invite Member
        </button>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : members.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-foreground/90">No team members yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Invite teammates by email to give them access to this mission.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left w-40">Role</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => {
              const p = profileMap.get(m.user_id);
              return (
                <tr key={m.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">{m.display_name ?? p?.display_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p?.email ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <RoleBadge role={m.role} />
                      <select
                        className="rounded-[6px] border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        value={m.role}
                        onChange={(e) => updateRole.mutate({ id: m.id, role: e.target.value as Role })}
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => removeMember.mutate(m.id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {showInvite && <InviteModal missionId={missionId} onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const tone: Record<Role, string> = {
    admin: "bg-primary/15 text-primary",
    lead: "bg-blue-500/15 text-blue-400",
    writer: "bg-emerald-500/15 text-emerald-400",
    sme: "bg-amber-500/15 text-amber-400",
    viewer: "bg-muted text-muted-foreground",
  };
  return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${tone[role]}`}>{role}</span>;
}

function InviteModal({ missionId, onClose }: { missionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const invite = useServerFn(inviteMissionMember);
  const [form, setForm] = useState<{ email: string; role: Role; displayName: string }>({ email: "", role: "writer", displayName: "" });

  const submit = useMutation({
    mutationFn: async () => {
      await invite({
        data: {
          missionId,
          email: form.email,
          role: form.role,
          displayName: form.displayName || undefined,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mission-members", missionId] });
      onClose();
    },
  });

  return (
    <ModalShell title="Invite Team Member" onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="teammate@company.com" /></Field>
        <Field label="Display Name (optional)"><input className={inputCls} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label="Role">
          <select className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">An email with a magic-link sign-in will be sent if the user doesn't already have an account.</p>
      {submit.isError && <p className="mt-3 text-xs text-destructive">{(submit.error as Error).message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-[8px] border border-border px-3 py-2 text-sm hover:bg-surface-hover">Cancel</button>
        <button
          disabled={!form.email || submit.isPending}
          onClick={() => submit.mutate()}
          className="rounded-[8px] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submit.isPending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Tab 4: Win Themes ────────────────────────── */

type WinTheme = {
  id: string;
  title: string;
  description: string | null;
  key_message: string | null;
  question_ids: string[] | null;
  status: string | null;
};

function ThemesTab({ missionId }: { missionId: string }) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WinTheme | null>(null);

  const { data: themes = [], isLoading } = useQuery({
    queryKey: ["win-themes", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("win_themes")
        .select("id,title,description,key_message,question_ids,status")
        .eq("mission_id", missionId)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      return (data ?? []) as WinTheme[];
    },
  });

  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("win_themes").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["win-themes", missionId] }),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Active Win Themes</h2>
        <button
          onClick={() => { setEditing(null); setShowModal(true); }}
          className="inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover"
        >
          <Plus className="h-3.5 w-3.5" /> Add Win Theme
        </button>
      </div>

      {isLoading ? (
        <div className="rounded-[10px] border border-border bg-surface p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : themes.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface p-12 text-center">
          <Sparkles className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-foreground/90">No win themes yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Define the strategic messages that should thread through every response.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {themes.map((t) => {
            const count = t.question_ids?.length ?? 0;
            return (
              <div key={t.id} className="rounded-[10px] border border-border bg-surface p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditing(t); setShowModal(true); }}
                      className="rounded-[6px] p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => archive.mutate(t.id)}
                      className="rounded-[6px] p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-destructive"
                      title="Archive"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {t.key_message && (
                  <p className="mt-2 rounded-[6px] border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs italic text-primary">
                    "{t.key_message}"
                  </p>
                )}
                {t.description && (
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Connected Questions</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">{count}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <WinThemeModal
          missionId={missionId}
          theme={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function WinThemeModal({ missionId, theme, onClose }: { missionId: string; theme: WinTheme | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: theme?.title ?? "",
    description: theme?.description ?? "",
    key_message: theme?.key_message ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (theme) {
        const { error } = await supabase
          .from("win_themes")
          .update({
            title: form.title,
            description: form.description || null,
            key_message: form.key_message || null,
          })
          .eq("id", theme.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("win_themes").insert({
          mission_id: missionId,
          title: form.title,
          description: form.description || null,
          key_message: form.key_message || null,
          status: "active",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["win-themes", missionId] });
      onClose();
    },
  });

  return (
    <ModalShell title={theme ? "Edit Win Theme" : "Add Win Theme"} onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Title">
          <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Proven delivery at scale" />
        </Field>
        <Field label="Key Message">
          <input className={inputCls} value={form.key_message} onChange={(e) => setForm({ ...form, key_message: e.target.value })} placeholder="One-line message that surfaces in every response" />
        </Field>
        <Field label="Description">
          <textarea rows={4} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Why this theme matters and how to substantiate it." />
        </Field>
      </div>
      {save.isError && <p className="mt-3 text-xs text-destructive">{(save.error as Error).message}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-[8px] border border-border px-3 py-2 text-sm hover:bg-surface-hover">Cancel</button>
        <button
          disabled={!form.title || save.isPending}
          onClick={() => save.mutate()}
          className="rounded-[8px] bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : theme ? "Save changes" : "Add theme"}
        </button>
      </div>
    </ModalShell>
  );
}

/* ─── Shared modal shell ────────────────────────── */

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-[12px] border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
