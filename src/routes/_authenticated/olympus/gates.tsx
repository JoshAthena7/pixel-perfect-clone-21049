import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, ClipboardCheck, X } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/olympus/gates")({
  component: GatesPage,
});

type Gate = {
  id: string;
  mission_id: string;
  gate_name: string;
  gate_order: number;
  description: string | null;
  target_date: string | null;
};

function GatesPage() {
  const missionId = useSelectedOlympusMission();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Gate> | null>(null);

  const { data: gates = [], isLoading } = useQuery({
    queryKey: ["olympus-gates", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data } = await supabase
        .from("mission_review_gates")
        .select("*")
        .eq("mission_id", missionId!)
        .order("gate_order", { ascending: true });
      return (data ?? []) as Gate[];
    },
  });

  async function remove(g: Gate) {
    if (!confirm(`Delete gate "${g.gate_name}"?`)) return;
    const { error } = await supabase.from("mission_review_gates").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    toast.success("Gate deleted");
    await logOlympusAction({
      action_type: "gate.delete",
      action_summary: `Deleted gate "${g.gate_name}"`,
      mission_id: missionId!,
      target_table: "mission_review_gates",
      target_id: g.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-gates", missionId] });
  }

  if (!missionId) {
    return <div className="mx-auto max-w-4xl px-8 py-16 text-center text-sm text-muted-foreground">Select a mission to manage its gates.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Gates</div>
          <h1 className="h1-display mt-1">Review Gates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Custom review checkpoints — Pink Team, Red Team, Gold Team, or anything you choose.
          </p>
        </div>
        <button
          onClick={() => setEditing({ mission_id: missionId, gate_order: gates.length + 1, gate_name: "", description: "", target_date: "" })}
          className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32]"
        >
          <Plus className="h-4 w-4" /> Add Gate
        </button>
      </header>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
        ) : gates.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <ClipboardCheck className="mx-auto mb-2 h-6 w-6 opacity-60" />
            No gates yet. Add one to set up a review checkpoint.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {gates.map((g) => (
              <li key={g.id} className="flex items-center gap-4 px-4 py-3 hover:bg-surface-hover">
                <GripVertical className="h-4 w-4 text-muted-foreground/40" />
                <div className="w-10 text-center text-[11px] font-semibold text-muted-foreground tabular-nums">#{g.gate_order}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{g.gate_name}</div>
                  {g.description && <div className="truncate text-[11px] text-muted-foreground">{g.description}</div>}
                </div>
                <div className="w-32 text-right text-[11px] text-muted-foreground tabular-nums">
                  {g.target_date ? new Date(g.target_date).toLocaleDateString() : "no target"}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(g)} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(g)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing && (
        <GateModal
          gate={editing}
          missionId={missionId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["olympus-gates", missionId] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function GateModal({ gate, missionId, onClose, onSaved }: {
  gate: Partial<Gate>; missionId: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    gate_name: gate.gate_name ?? "",
    gate_order: gate.gate_order ?? 1,
    description: gate.description ?? "",
    target_date: gate.target_date ?? "",
  });
  const [busy, setBusy] = useState(false);
  const isNew = !gate.id;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.gate_name.trim()) return toast.error("Gate name is required");
    setBusy(true);
    const payload = {
      mission_id: missionId,
      gate_name: form.gate_name.trim(),
      gate_order: Number(form.gate_order) || 1,
      description: form.description.trim() || null,
      target_date: form.target_date || null,
    };
    const res = isNew
      ? await supabase.from("mission_review_gates").insert(payload).select("id").single()
      : await supabase.from("mission_review_gates").update(payload).eq("id", gate.id!).select("id").single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(isNew ? "Gate created" : "Gate updated");
    await logOlympusAction({
      action_type: isNew ? "gate.create" : "gate.update",
      action_summary: `${isNew ? "Created" : "Updated"} gate "${form.gate_name.trim()}"`,
      mission_id: missionId,
      target_table: "mission_review_gates",
      target_id: res.data?.id ?? gate.id ?? null,
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-[10px] border border-border bg-surface p-6">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>{isNew ? "New Gate" : "Edit Gate"}</div>
        <h2 className="mt-1 text-lg font-semibold">{isNew ? "Add Review Gate" : form.gate_name}</h2>

        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Gate name</label>
            <input value={form.gate_name} onChange={(e) => setForm({ ...form, gate_name: e.target.value })}
              placeholder="Pink Team Review" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Order</label>
              <input type="number" min={1} value={form.gate_order} onChange={(e) => setForm({ ...form, gate_order: Number(e.target.value) })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Target date</label>
              <input type="date" value={form.target_date ?? ""} onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Description</label>
            <textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="What reviewers should look for at this gate." />
          </div>
        </div>

        <footer className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
          <button type="submit" disabled={busy}
            className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50">
            {busy ? "Saving…" : isNew ? "Create Gate" : "Save Changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
