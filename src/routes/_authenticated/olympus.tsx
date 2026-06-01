import React, { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Activity, Settings as SettingsIcon, AlertCircle, Plus, ArrowRight, X, Zap } from "lucide-react";
import { relativeTime } from "@/lib/signals";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/olympus")({
  component: OlympusPage,
});

type Tab = "status" | "missions" | "settings";

type AuditRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  mission_id: string | null;
  action_type: string;
  action_summary: string;
  target_table: string | null;
};

function OlympusPage() {
  const [tab, setTab] = useState<Tab>("missions");

  const { data: me } = useQuery({
    queryKey: ["olympus-me-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { isAdmin: false, hasNoMissions: true };
      const { data } = await supabase
        .from("mission_members")
        .select("role")
        .eq("user_id", user.id);
      const roles = (data ?? []).map((r) => r.role);
      return {
        isAdmin: roles.includes("admin") || roles.includes("lead"),
        hasNoMissions: roles.length === 0,
      };
    },
  });

  // Allow first-time users (no missions yet) — they need Olympus to create the first mission.
  if (me && !me.isAdmin && !me.hasNoMissions) {
    return (
      <div className="mx-auto max-w-2xl px-8 py-16 text-center">
        <Shield className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Olympus</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Olympus is restricted to mission admins and leads.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <header className="mb-6">
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Olympus</div>
        <h1 className="h1-display mt-1">Administration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mission lifecycle, audit trail, and firm-level configuration.
        </p>
      </header>

      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {([
          ["status", "Status", Activity],
          ["missions", "Missions", Shield],
          ["settings", "Settings", SettingsIcon],
        ] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative inline-flex items-center gap-1.5 px-4 py-2.5 text-sm transition ${
              tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {tab === k && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "status" && <StatusTab />}
      {tab === "missions" && <MissionsTab />}
      {tab === "settings" && <SettingsPlaceholder />}
    </div>
  );
}

/* ─── Status tab — ARCH-3 audit feed ────────────── */

function StatusTab() {
  const { data: audit = [], isLoading } = useQuery({
    queryKey: ["olympus-audit"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("olympus_audit_log")
        .select("id,created_at,user_name,mission_id,action_type,action_summary,target_table")
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []) as AuditRow[];
    },
  });

  const missionIds = Array.from(new Set(audit.map((a) => a.mission_id).filter(Boolean) as string[]));
  const { data: missions = [] } = useQuery({
    queryKey: ["olympus-audit-missions", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("id,name").in("id", missionIds);
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const mMap = Object.fromEntries(missions.map((m) => [m.id, m.name]));

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Audit Trail</h2>
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Last 100</span>
      </div>
      {isLoading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : audit.length === 0 ? (
        <div className="p-12 text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-foreground/90">No audited actions yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Privileged actions taken in Olympus will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {audit.map((a) => (
            <li key={a.id} className="px-5 py-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary normal-case tracking-normal">{a.action_type}</span>
                {a.mission_id && (
                  <span className="rounded-full border border-border bg-background px-2 py-0.5 truncate max-w-[200px] normal-case tracking-normal">
                    {mMap[a.mission_id] ?? "Mission"}
                  </span>
                )}
                <span className="ml-auto">{relativeTime(a.created_at)}</span>
              </div>
              <p className="mt-1 text-sm text-foreground">{a.action_summary}</p>
              {a.user_name && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">by {a.user_name}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Missions tab — lifecycle overview ────────── */

type MissionRow = {
  id: string;
  name: string;
  client: string;
  status: string | null;
  health: string | null;
  submission_date: string | null;
  question_count: number | null;
};

function MissionsTab() {
  const [activateOpen, setActivateOpen] = useState(false);

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ["olympus-missions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("missions")
        .select("id,name,client,status,health,submission_date,question_count")
        .order("created_at", { ascending: false });
      return (data ?? []) as MissionRow[];
    },
  });

  const missionIds = missions.map((m) => m.id);
  const { data: writerCounts = {} } = useQuery({
    queryKey: ["olympus-writer-counts", missionIds.join(",")],
    enabled: missionIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_members")
        .select("mission_id,role")
        .in("mission_id", missionIds)
        .eq("role", "writer");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { counts[r.mission_id] = (counts[r.mission_id] ?? 0) + 1; });
      return counts;
    },
  });

  function daysTo(date: string | null): number | null {
    if (!date) return null;
    return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <h2 className="h2-label">Mission Command</h2>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{missions.length} total</span>
        </div>
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : missions.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground opacity-60" />
            <p className="text-sm text-foreground/90">No missions yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Activate your first mission below to begin.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Mission</th>
                <th className="px-4 py-3 text-left w-28">Status</th>
                <th className="px-4 py-3 text-left w-32">Submission</th>
                <th className="px-4 py-3 text-left w-24">Questions</th>
                <th className="px-4 py-3 text-left w-24">Writers</th>
                <th className="px-4 py-3 text-left w-20">Health</th>
                <th className="px-4 py-3 text-right w-48">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {missions.map((m) => {
                const days = daysTo(m.submission_date);
                const healthCls = m.health?.toLowerCase() === "green" ? "dot-green"
                  : m.health?.toLowerCase() === "red" ? "dot-red" : "dot-yellow";
                return (
                  <tr key={m.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground">{m.client}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                        m.status === "Active" ? "bg-primary/15 text-primary"
                        : m.status === "Archived" ? "bg-muted text-muted-foreground"
                        : "bg-amber-500/15 text-amber-400"
                      }`}>{m.status ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {days === null ? "—" : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{m.question_count ?? 0}</td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">{writerCounts[m.id] ?? 0}</td>
                    <td className="px-4 py-3"><span className={`dot ${healthCls}`} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to="/missions/$missionId/settings"
                        params={{ missionId: m.id }}
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                      >
                        Enter Mission Olympus <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-border bg-surface/40 px-6 py-10">
        <h3 className="h2-label">Activate New Mission</h3>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Stand up a new RFP response. You'll add the team, upload the RFP, and configure scoring after activation.
        </p>
        <button
          onClick={() => setActivateOpen(true)}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#C49A22] px-6 py-3 text-base font-semibold text-black hover:bg-[#D4AA32] transition"
        >
          <Plus className="h-4 w-4" /> Activate New Mission
        </button>
      </div>

      {activateOpen && (
        <ModalErrorBoundary onClose={() => setActivateOpen(false)}>
          <ActivateMissionModal onClose={() => setActivateOpen(false)} />
        </ModalErrorBoundary>
      )}
    </div>
  );
}

/* ─── Error boundary so a modal crash never blanks the page ─── */

class ModalErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ActivateMissionModal crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={this.props.onClose} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-red-500/40 bg-[#111827] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-red-300">Modal failed to load</h2>
            <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
            <button onClick={this.props.onClose} className="rounded-lg border border-[#2a3a55] px-4 py-2 text-sm text-[#e8edf5] hover:bg-[#1a2235] transition mt-4">Close</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─── Activate Mission Modal ────────────────── */

function ActivateMissionModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    client: "",
    state: "",
    program_type: "",
    submission_date: "",
    description: "",
  });

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!form.name.trim() || !form.client.trim()) {
      setErrorMsg("Mission name and client are required.");
      return;
    }
    setBusy(true);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw new Error(userErr?.message ?? "Not authenticated");

      // Safety net: ensure a profile row exists for this user
      await supabase.from("profiles").upsert(
        { id: user.id, display_name: user.email?.split("@")[0] ?? "User", email: user.email ?? null },
        { onConflict: "id" },
      );

      const desc = form.program_type
        ? `${form.program_type}${form.description ? "\n\n" + form.description : ""}`
        : form.description || null;

      const { data, error } = await supabase
        .from("missions")
        .insert({
          name: form.name.trim(),
          client: form.client.trim(),
          state: form.state.trim() || null,
          submission_date: form.submission_date || null,
          description: desc,
          status: "Active",
          health: "Yellow",
          created_by: user.id,
        })
        .select("id")
        .single();

      if (error) {
        console.error("Mission insert failed:", error);
        throw new Error(error.message);
      }
      if (!data?.id) throw new Error("Mission was created but no id was returned.");

      setSuccessMsg("Mission created! Setting up your workspace…");
      toast.success("Mission activated.");
      qc.invalidateQueries({ queryKey: ["olympus-missions"] });
      qc.invalidateQueries({ queryKey: ["sidebar-missions"] });
      qc.invalidateQueries({ queryKey: ["hq-missions"] });
      qc.invalidateQueries({ queryKey: ["olympus-me-role"] });
      setTimeout(() => {
        navigate({ to: "/missions/$missionId/settings", params: { missionId: data.id } });
      }, 600);
    } catch (err: any) {
      console.error("Mission activation error:", err);
      const msg = err?.message ?? "Failed to activate mission.";
      setErrorMsg(msg);
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-backdrop" />
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="modal-surface relative w-full max-w-lg p-6"
      >
        <header className="mb-5 flex items-start justify-between">
          <div>
            <div className="h2-label">Activation</div>
            <h2 className="mt-1 text-lg font-semibold">Activate New Mission</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-1">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4">
          <Field label="Mission name *" value={form.name} onChange={(v) => update("name", v)} placeholder="Indiana Medicaid RFP" />
          <Field label="Client *" value={form.client} onChange={(v) => update("client", v)} placeholder="Indiana FSSA" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="State" value={form.state} onChange={(v) => update("state", v)} placeholder="IN" />
            <Field label="Program type" value={form.program_type} onChange={(v) => update("program_type", v)} placeholder="Medicaid MCO" />
          </div>
          <Field label="Submission date" type="date" value={form.submission_date} onChange={(v) => update("submission_date", v)} />
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional context for the team."
            />
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mt-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {successMsg}
          </div>
        )}

        <footer className="mt-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={busy}>Cancel</button>
          <button type="submit" className="btn-primary inline-flex items-center gap-2" disabled={busy || !!successMsg}>
            {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {successMsg ? "Activated" : busy ? "Activating…" : "Activate Mission"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div className="rounded-[10px] border border-dashed border-border bg-surface/50 p-12 text-center text-sm text-muted-foreground">
      Firm-level settings — Slack defaults, email templates, IRIS prompts — coming soon.
    </div>
  );
}
