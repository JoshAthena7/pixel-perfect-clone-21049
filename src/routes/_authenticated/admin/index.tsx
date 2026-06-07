import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, ArrowRight, Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { logOlympusAction } from "@/lib/audit";
import { MissionReadinessPanel, ReadinessChip } from "@/components/v2/MissionReadinessPanel";
import { IrisGreeting } from "@/components/v2/IrisGreeting";
import { DeveloperResetCard } from "@/components/admin/DeveloperResetCard";
import { IrisHealthCheckCard } from "@/components/admin/IrisHealthCheckCard";
import { RefreshIrisCard } from "@/components/admin/RefreshIrisCard";
import { BackfillEmbeddingsCard } from "@/components/admin/BackfillEmbeddingsCard";


export const Route = createFileRoute("/_authenticated/admin/")({
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
  const [readinessFor, setReadinessFor] = useState<MissionRow | null>(null);


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
          <IrisGreeting screen="olympus" />
          <div className="mt-4 h2-label" style={{ letterSpacing: "0.32em" }}>Missions</div>
          <h1 className="h1-display mt-1">All Missions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every procurement Athena is working on. Create, activate, edit, or archive from here.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] transition"
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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Mission</th>
                <th className="px-4 py-3 text-left w-28">Status</th>
                <th className="px-4 py-3 text-left w-32">Submission</th>
                <th className="px-4 py-3 text-left w-20">Qs</th>
                <th className="px-4 py-3 text-left w-20">Health</th>
                <th className="px-4 py-3 text-left w-32">Created</th>
                <th className="px-4 py-3 text-left w-24">Readiness</th>
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
                      <Link
                        to="/admin/missions/$missionId/setup" params={{ missionId: m.id }}
                        className="block group"
                        title="Open Setup Record"
                      >
                        <div className="font-medium text-foreground group-hover:text-primary">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground">{m.client}</div>
                      </Link>
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
                    <td className="px-4 py-3">
                      <ReadinessChip missionId={m.id} onClick={() => setReadinessFor(m)} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Link
                        to="/missions/$missionId/brief" params={{ missionId: m.id }}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/10"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                      {isDraft && (
                        <button
                          onClick={() => setActivateFor(m)}
                          className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/25"
                        >
                          Activate
                        </button>
                      )}
                      {(m.status === "Won" || m.status === "Lost") && (
                        <Link
                          to="/admin/missions/$missionId/debrief" params={{ missionId: m.id }}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-[12px] font-medium text-amber-400 hover:bg-amber-500/25"
                        >
                          Debrief
                        </Link>
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
          </div>
        )}
      </div>

      {createOpen && (
        <ModalErrorBoundary onClose={() => setCreateOpen(false)}>
          <CreateMissionModal onClose={() => setCreateOpen(false)} />
        </ModalErrorBoundary>
      )}
      {activateFor && (
        <ActivateRedirect missionId={activateFor.id} onDone={() => setActivateFor(null)} />
      )}
      {readinessFor && (
        <MissionReadinessPanel
          missionId={readinessFor.id}
          missionName={readinessFor.name}
          missionStatus={readinessFor.status}
          onClose={() => setReadinessFor(null)}
        />
      )}

      <IrisHealthCheckCard />
      <RefreshIrisCard />
      <BackfillEmbeddingsCard />
      <DeveloperResetCard />
    </div>
  );
}
//


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

/* Unified flow: creating or activating a mission goes straight to the Setup Record. */

function CreateMissionModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !client.trim()) {
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
      const { data, error } = await supabase
        .from("missions")
        .insert({
          name: name.trim(),
          client: client.trim(),
          status: "Draft",
          health: "Yellow",
          created_by: user.id,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error("Created but no id returned.");
      await logOlympusAction({
        action_type: "mission.create",
        action_summary: `Created mission "${name.trim()}"`,
        mission_id: data.id,
        target_table: "missions",
        target_id: data.id,
      });
      window.localStorage.setItem("olympus:mission", data.id);
      window.dispatchEvent(new CustomEvent("olympus:mission-changed", { detail: data.id }));
      toast.success("Mission created — opening Setup Record");
      onClose();
      navigate({ to: "/admin/missions/$missionId/setup", params: { missionId: data.id } });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create mission");
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} title="Create New Mission" subtitle="Mission Setup">
      <form onSubmit={submit} className="space-y-4">
        <TextField label="Mission name *" value={name} onChange={setName} placeholder="Indiana Medicaid RFP" />
        <TextField label="Client *" value={client} onChange={setClient} placeholder="Indiana FSSA" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          IRIS needs this information to start building your procurement intelligence profile.
          Creating a mission opens a 9-section Intelligence Setup Record — takes about 20 minutes and activates IRIS.
          Once created, this mission will appear in your active pursuit list. You can archive it at any time.
        </p>
        {err && <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</div>}
        <footer className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Create Mission & Begin Setup Record <ArrowRight className="h-4 w-4" />
          </button>
        </footer>
      </form>
    </ModalShell>
  );
}

function ActivateRedirect({ missionId, onDone }: { missionId: string; onDone: () => void }) {
  const navigate = useNavigate();
  if (typeof window !== "undefined") {
    setTimeout(() => {
      onDone();
      navigate({ to: "/admin/missions/$missionId/setup", params: { missionId } });
    }, 0);
  }
  return null;
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
