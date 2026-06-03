import React, { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, ArrowRight, Archive, Pencil } from "lucide-react";
import { toast } from "sonner";
import { logOlympusAction } from "@/lib/audit";
import { MissionActivationWizard } from "@/components/v2/MissionActivationWizard";


export const Route = createFileRoute("/_authenticated/olympus/")({
  component: MissionsIndex,
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

const STATUSES = ["Draft", "Active", "Pens Down", "Submitted", "Closed", "Archived"] as const;

function MissionsIndex() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [activateFor, setActivateFor] = useState<MissionRow | null>(null);

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["olympus-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,status,health,submission_date,question_count,created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as MissionRow[];
    },
  });

  async function archive(m: MissionRow) {
    if (!confirm(`Archive "${m.name}"? Team members will lose access.`)) return;
    const { error } = await supabase.from("missions").update({ status: "Archived" }).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Mission archived");
    await logOlympusAction({
      action_type: "mission.archive",
      action_summary: `Archived mission "${m.name}"`,
      mission_id: m.id,
      target_table: "missions",
      target_id: m.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
  }

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Missions</div>
          <h1 className="h1-display mt-1">All Missions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every procurement Athena is working on. Create, activate, edit, or archive from here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => toast.message("Import from Template — coming soon")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-surface-hover"
          >
            Import from Template
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] transition"
          >
            <Plus className="h-4 w-4" /> Create New Mission
          </button>
        </div>
      </header>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-3 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
        ) : missions.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No missions yet. Click <span className="text-foreground font-medium">Create New Mission</span> to begin.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Mission</th>
                <th className="px-4 py-3 text-left w-28">Status</th>
                <th className="px-4 py-3 text-left w-32">Submission</th>
                <th className="px-4 py-3 text-left w-20">Qs</th>
                <th className="px-4 py-3 text-left w-20">Health</th>
                <th className="px-4 py-3 text-left w-32">Created</th>
                <th className="px-4 py-3 text-right w-72">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {missions.map((m) => {
                const days = m.submission_date ? Math.ceil((new Date(m.submission_date).getTime() - Date.now()) / 86400000) : null;
                const healthCls = m.health?.toLowerCase() === "green" ? "dot-green" : m.health?.toLowerCase() === "red" ? "dot-red" : "dot-yellow";
                const isDraft = (m.status ?? "Draft") === "Draft";
                return (
                  <tr key={m.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground">{m.client}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{m.question_count ?? 0}</td>
                    <td className="px-4 py-3"><span className={`dot ${healthCls}`} /></td>
                    <td className="px-4 py-3 text-[11px] text-muted-foreground">
                      {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Link
                        to="/missions/$missionId/overview" params={{ missionId: m.id }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/10"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                      <Link
                        to="/missions/$missionId/settings" params={{ missionId: m.id }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                        title="Edit"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </Link>
                      {isDraft && (
                        <button
                          onClick={() => setActivateFor(m)}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/25"
                        >
                          Activate
                        </button>
                      )}
                      {m.status !== "Archived" && (
                        <button
                          onClick={() => archive(m)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                          title="Archive"
                        >
                          <Archive className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {createOpen && (
        <ModalErrorBoundary onClose={() => setCreateOpen(false)}>
          <CreateMissionModal onClose={() => setCreateOpen(false)} />
        </ModalErrorBoundary>
      )}
      {activateFor && (
        <ModalErrorBoundary onClose={() => setActivateFor(null)}>
          <ActivateChecklistModal mission={activateFor} onClose={() => setActivateFor(null)} />
        </ModalErrorBoundary>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string | null }) {
  const s = status ?? "Draft";
  const cls =
    s === "Active" ? "bg-primary/15 text-primary"
    : s === "Pens Down" ? "bg-amber-500/15 text-amber-400"
    : s === "Submitted" ? "bg-emerald-500/15 text-emerald-400"
    : s === "Closed" || s === "Archived" ? "bg-muted text-muted-foreground"
    : "bg-surface text-muted-foreground border border-border";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${cls}`}>{s}</span>;
}

/* ────────── Create Mission Modal ────────── */

function CreateMissionModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", client: "", state: "", program_type: "Medicaid",
    submission_date: "", description: "",
  });

  function upd<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.name.trim() || !form.client.trim()) {
      setErr("Mission name and client are required.");
      return;
    }
    setBusy(true);
    try {
      const { data: { user }, error: ue } = await supabase.auth.getUser();
      if (ue || !user) throw new Error(ue?.message ?? "Not authenticated");
      await supabase.from("profiles").upsert(
        { id: user.id, display_name: user.email?.split("@")[0] ?? "User", email: user.email ?? null },
        { onConflict: "id" },
      );
      const desc = form.program_type ? `${form.program_type}${form.description ? "\n\n" + form.description : ""}` : form.description || null;
      const { data, error } = await supabase
        .from("missions")
        .insert({
          name: form.name.trim(),
          client: form.client.trim(),
          state: form.state.trim() || null,
          submission_date: form.submission_date || null,
          description: desc,
          status: "Draft",
          health: "Yellow",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error("Created but no id returned.");

      toast.success("Mission created as Draft");
      await logOlympusAction({
        action_type: "mission.create",
        action_summary: `Created mission "${form.name.trim()}"`,
        mission_id: data.id,
        target_table: "missions",
        target_id: data.id,
      });
      window.localStorage.setItem("olympus:mission", data.id);
      window.dispatchEvent(new CustomEvent("olympus:mission-changed", { detail: data.id }));
      qc.invalidateQueries({ queryKey: ["olympus-missions"] });
      qc.invalidateQueries({ queryKey: ["olympus-header-missions"] });
      navigate({ to: "/olympus/settings" });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create mission");
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Create New Mission" subtitle="Setup">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Mission name *" value={form.name} onChange={(v) => upd("name", v)} placeholder="Indiana Medicaid RFP" />
        <TextField label="Client *" value={form.client} onChange={(v) => upd("client", v)} placeholder="Indiana FSSA" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="State" value={form.state} onChange={(v) => upd("state", v)} placeholder="IN" />
          <SelectField label="Procurement type" value={form.program_type} onChange={(v) => upd("program_type", v)}
            options={["Medicaid", "Medicare", "CHIP", "Other"]} />
        </div>
        <TextField label="Submission deadline" type="date" value={form.submission_date} onChange={(v) => upd("submission_date", v)} />
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Description</label>
          <textarea
            value={form.description} onChange={(e) => upd("description", e.target.value)} rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Optional context for the team."
          />
        </div>
        {err && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
        <footer className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover" disabled={busy}>Cancel</button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {busy ? "Creating…" : "Create Mission"}
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

/* ────────── Activate Checklist Modal ────────── */

function ActivateChecklistModal({ mission, onClose }: { mission: MissionRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: check, isLoading } = useQuery({
    queryKey: ["olympus-activate-check", mission.id],
    queryFn: async () => {
      const [rfp, writers, gates, missionRow] = await Promise.all([
        supabase.from("mission_library").select("id", { count: "exact", head: true }).eq("mission_id", mission.id).eq("is_rfp", true),
        supabase.from("mission_members").select("id", { count: "exact", head: true }).eq("mission_id", mission.id).eq("role", "writer"),
        supabase.from("mission_review_gates").select("id", { count: "exact", head: true }).eq("mission_id", mission.id),
        supabase.from("missions").select("submission_date").eq("id", mission.id).maybeSingle(),
      ]);
      return {
        rfp: (rfp.count ?? 0) > 0,
        writer: (writers.count ?? 0) > 0,
        gate: (gates.count ?? 0) > 0,
        deadline: !!missionRow.data?.submission_date,
      };
    },
  });

  async function activate() {
    setBusy(true);
    const { error } = await supabase.from("missions").update({ status: "Active" }).eq("id", mission.id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    toast.success(`${mission.name} is now Active`);
    await logOlympusAction({
      action_type: "mission.activate",
      action_summary: `Activated mission "${mission.name}"`,
      mission_id: mission.id,
      target_table: "missions",
      target_id: mission.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-missions"] });
    onClose();
  }

  const items = [
    { label: "RFP uploaded", ok: check?.rfp },
    { label: "At least one writer assigned", ok: check?.writer },
    { label: "Submission date set", ok: check?.deadline },
    { label: "At least one Review Gate set", ok: check?.gate },
  ];
  const warnings = items.filter((i) => i.ok === false).length;

  return (
    <ModalShell onClose={onClose} title={`Activate ${mission.name}`} subtitle="Activation Checklist">
      <p className="text-sm text-muted-foreground">
        Activating makes this mission visible to assigned team members in the Lobby and Cockpit. Drafts are hidden from non-admins.
      </p>
      <ul className="mt-4 space-y-2">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
            {isLoading ? <Circle className="h-4 w-4 text-muted-foreground" />
              : i.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              : <AlertCircle className="h-4 w-4 text-amber-400" />}
            <span className={i.ok ? "text-foreground" : "text-muted-foreground"}>{i.label}</span>
          </li>
        ))}
      </ul>
      {warnings > 0 && !isLoading && (
        <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {warnings} item{warnings === 1 ? "" : "s"} unchecked. You can activate anyway — IRIS will continue flagging risks in the mission.
        </div>
      )}
      <footer className="mt-6 flex items-center justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover" disabled={busy}>Cancel</button>
        <button onClick={activate} disabled={busy || isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
          {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          <Zap className="h-4 w-4" /> Activate Mission
        </button>
      </footer>
    </ModalShell>
  );
}

/* ────────── Helpers ────────── */

function ModalShell({ onClose, title, subtitle, children }: {
  onClose: () => void; title: string; subtitle: string; children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} className="relative z-10 w-full max-w-lg rounded-xl border border-[#2a3a55] bg-[#111827] p-6 shadow-2xl">
        <header className="mb-5 flex items-start justify-between">
          <div>
            <div className="h2-label">{subtitle}</div>
            <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost p-1"><X className="h-4 w-4" /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

class ModalErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Olympus modal crashed:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={this.props.onClose} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-red-500/40 bg-[#111827] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-red-300">Modal failed to load</h2>
            <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
            <button onClick={this.props.onClose} className="mt-4 rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Close</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export { STATUSES };
