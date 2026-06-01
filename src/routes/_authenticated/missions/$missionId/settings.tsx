import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Save, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$missionId/settings")({
  component: SettingsPage,
});

const STATUSES = ["Active", "Won", "Lost", "Withdrawn", "On Hold"] as const;
const HEALTHS = ["green", "yellow", "red"] as const;

function SettingsPage() {
  const { missionId } = Route.useParams();
  const qc = useQueryClient();

  const { data: mission, isLoading } = useQuery({
    queryKey: ["mission", missionId],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("*").eq("id", missionId).maybeSingle();
      return data;
    },
  });

  const { data: gates = [] } = useQuery({
    queryKey: ["mission-gates", missionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("*")
        .eq("mission_id", missionId)
        .order("gate_order", { ascending: true });
      return data ?? [];
    },
  });

  const [form, setForm] = useState({
    name: "",
    client: "",
    state: "",
    status: "Active",
    health: "green",
    submission_date: "",
    description: "",
    slack_webhook: "",
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
      await supabase
        .from("missions")
        .update({
          name: form.name,
          client: form.client,
          state: form.state || null,
          status: form.status,
          health: form.health,
          submission_date: form.submission_date || null,
          description: form.description || null,
          slack_webhook: form.slack_webhook || null,
        })
        .eq("id", missionId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission", missionId] }),
  });

  const addGate = useMutation({
    mutationFn: async () => {
      await supabase.from("mission_review_gates").insert({
        mission_id: missionId,
        gate_name: "New Gate",
        gate_order: gates.length + 1,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-gates", missionId] }),
  });

  const deleteGate = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("mission_review_gates").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-gates", missionId] }),
  });

  if (isLoading) return <div className="px-8 py-12 text-sm text-muted-foreground">Loading mission…</div>;
  if (!mission) return <div className="px-8 py-12 text-sm text-muted-foreground">Mission not found.</div>;

  return (
    <div className="px-8 py-8 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Mission Settings</h1>
          <p className="mt-1 text-xs text-muted-foreground">Core configuration, review gates, and integrations.</p>
        </div>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-2 rounded-[8px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div className="rounded-[10px] border border-border bg-surface p-6">
        <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Core</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Mission Name">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Client">
            <input className={inputCls} value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
          </Field>
          <Field label="State">
            <input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </Field>
          <Field label="Submission Date">
            <input type="date" className={inputCls} value={form.submission_date} onChange={(e) => setForm({ ...form, submission_date: e.target.value })} />
          </Field>
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
          <Field label="Description" full>
            <textarea rows={3} className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="mt-6 rounded-[10px] border border-border bg-surface p-6">
        <h2 className="mb-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Integrations</h2>
        <Field label="Slack Webhook URL">
          <input className={inputCls} placeholder="https://hooks.slack.com/services/…" value={form.slack_webhook} onChange={(e) => setForm({ ...form, slack_webhook: e.target.value })} />
        </Field>
      </div>

      <div className="mt-6 rounded-[10px] border border-border bg-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Review Gates</h2>
          <button onClick={() => addGate.mutate()} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add gate
          </button>
        </div>
        {gates.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-foreground/90">No review gates configured.</p>
            <p className="mt-1 text-xs text-muted-foreground">Add gates like Pink Team, Red Team, and Gold Team to track review cycles.</p>
          </div>
        ) : (
          <GateList missionId={missionId} gates={gates as any} onDelete={(id) => deleteGate.mutate(id)} />
        )}
      </div>
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

function GateList({
  missionId,
  gates,
  onDelete,
}: {
  missionId: string;
  gates: Array<{ id: string; gate_name: string; gate_order: number; target_date: string | null; description: string | null }>;
  onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: async (g: { id: string; gate_name: string; target_date: string | null; description: string | null }) => {
      await supabase.from("mission_review_gates").update({
        gate_name: g.gate_name,
        target_date: g.target_date,
        description: g.description,
      }).eq("id", g.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mission-gates", missionId] }),
  });

  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border bg-surface-hover text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <tr>
          <th className="px-4 py-3 text-left w-12">#</th>
          <th className="px-4 py-3 text-left">Gate Name</th>
          <th className="px-4 py-3 text-left">Target Date</th>
          <th className="px-4 py-3 text-left">Description</th>
          <th className="px-4 py-3 w-12" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {gates.map((g) => (
          <tr key={g.id} className="hover:bg-surface-hover">
            <td className="px-4 py-2 font-mono text-muted-foreground">{g.gate_order}</td>
            <td className="px-4 py-2">
              <input
                className={inputCls}
                defaultValue={g.gate_name}
                onBlur={(e) => e.target.value !== g.gate_name && update.mutate({ ...g, gate_name: e.target.value })}
              />
            </td>
            <td className="px-4 py-2">
              <input
                type="date"
                className={inputCls}
                defaultValue={g.target_date ?? ""}
                onBlur={(e) => (e.target.value || null) !== g.target_date && update.mutate({ ...g, target_date: e.target.value || null })}
              />
            </td>
            <td className="px-4 py-2">
              <input
                className={inputCls}
                defaultValue={g.description ?? ""}
                onBlur={(e) => (e.target.value || null) !== g.description && update.mutate({ ...g, description: e.target.value || null })}
              />
            </td>
            <td className="px-4 py-2 text-right">
              <button onClick={() => onDelete(g.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
