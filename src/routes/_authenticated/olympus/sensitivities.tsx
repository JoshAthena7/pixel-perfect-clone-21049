import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X, AlertTriangle } from "lucide-react";
import { useSelectedOlympusMission } from "../olympus";
import { logOlympusAction } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/olympus/sensitivities")({
  component: SensitivitiesPage,
});

type Sensitivity = {
  id: string;
  mission_id: string;
  category: string;
  subject: string | null;
  note: string;
  severity: "low" | "medium" | "high";
  created_at: string;
};

const CATEGORIES = [
  { value: "terminology", label: "Terminology / Naming" },
  { value: "person", label: "Person" },
  { value: "topic", label: "Topic to avoid" },
  { value: "tone", label: "Tone / Style" },
  { value: "stakeholder", label: "Stakeholder dynamic" },
  { value: "general", label: "General" },
];

const SEVERITY_STYLES: Record<string, string> = {
  low: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  medium: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  high: "bg-red-500/10 text-red-300 border-red-500/30",
};

function SensitivitiesPage() {
  const missionId = useSelectedOlympusMission();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Sensitivity> | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["olympus-sensitivities", missionId],
    enabled: !!missionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mission_sensitivities")
        .select("*")
        .eq("mission_id", missionId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Sensitivity[];
    },
  });

  async function remove(s: Sensitivity) {
    if (!confirm("Delete this sensitivity note?")) return;
    const { error } = await supabase.from("mission_sensitivities").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    await logOlympusAction({
      action_type: "sensitivity.delete",
      action_summary: `Deleted sensitivity (${s.category}${s.subject ? ` · ${s.subject}` : ""})`,
      mission_id: missionId!,
      target_table: "mission_sensitivities",
      target_id: s.id,
    });
    qc.invalidateQueries({ queryKey: ["olympus-sensitivities", missionId] });
  }

  if (!missionId) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-16 text-center text-sm text-muted-foreground">
        Select a mission to manage sensitivities.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="h2-label" style={{ letterSpacing: "0.32em" }}>Sensitivities</div>
          <h1 className="h1-display mt-1">Nuance & Watch-Outs</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Capture the unwritten rules — preferred terminology, topics to avoid, person-specific cautions
            (e.g. "the plan leader does not want this called an MCO", or "don't ask Jane about X, Y, Z").
            These surface in the Cockpit so the team writes with full context.
          </p>
        </div>
        <button
          onClick={() =>
            setEditing({ mission_id: missionId, category: "terminology", subject: "", note: "", severity: "medium" })
          }
          className="inline-flex items-center gap-2 rounded-md bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32]"
        >
          <Plus className="h-4 w-4" /> Add Sensitivity
        </button>
      </header>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20 w-full" />)}</div>
      ) : items.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface p-12 text-center text-sm text-muted-foreground">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 opacity-60" />
          No sensitivities yet. Add one to share the nuance every writer should know.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => {
            const cat = CATEGORIES.find((c) => c.value === s.category)?.label ?? s.category;
            return (
              <div key={s.id} className="rounded-[10px] border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${SEVERITY_STYLES[s.severity]}`}>
                        {s.severity}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{cat}</span>
                      {s.subject && (
                        <span className="text-[11px] text-muted-foreground">· {s.subject}</span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground">{s.note}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setEditing(s)} className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(s)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <SensitivityModal
          item={editing}
          missionId={missionId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["olympus-sensitivities", missionId] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SensitivityModal({
  item, missionId, onClose, onSaved,
}: {
  item: Partial<Sensitivity>;
  missionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    category: item.category ?? "terminology",
    subject: item.subject ?? "",
    note: item.note ?? "",
    severity: (item.severity ?? "medium") as "low" | "medium" | "high",
  });
  const [busy, setBusy] = useState(false);
  const isNew = !item.id;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const note = form.note.trim();
    if (!note) return toast.error("Note is required");
    if (note.length > 4000) return toast.error("Note must be under 4000 characters");
    setBusy(true);
    const payload: any = {
      mission_id: missionId,
      category: form.category,
      subject: form.subject.trim() || null,
      note,
      severity: form.severity,
    };
    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser();
      payload.created_by = user?.id;
    }
    const res = isNew
      ? await supabase.from("mission_sensitivities").insert(payload).select("id").single()
      : await supabase.from("mission_sensitivities").update(payload).eq("id", item.id!).select("id").single();
    setBusy(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(isNew ? "Sensitivity added" : "Sensitivity updated");
    await logOlympusAction({
      action_type: isNew ? "sensitivity.create" : "sensitivity.update",
      action_summary: `${isNew ? "Added" : "Updated"} sensitivity (${form.category}${form.subject ? ` · ${form.subject.trim()}` : ""})`,
      mission_id: missionId,
      target_table: "mission_sensitivities",
      target_id: res.data?.id ?? item.id ?? null,
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl rounded-[10px] border border-border bg-surface p-6 max-h-[85vh] overflow-y-auto"
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-surface-hover">
          <X className="h-4 w-4" />
        </button>
        <div className="h2-label" style={{ letterSpacing: "0.32em" }}>{isNew ? "New" : "Edit"}</div>
        <h2 className="mt-1 text-lg font-semibold">Sensitivity</h2>

        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Severity</label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as any })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="low">Low — FYI</option>
                <option value="medium">Medium — be careful</option>
                <option value="high">High — must follow</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Subject <span className="text-muted-foreground/70 normal-case">(optional — person, org, or topic)</span>
            </label>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              maxLength={200}
              placeholder="e.g. Jane Doe, Plan Leader, MCO terminology"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Note</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={5}
              maxLength={4000}
              placeholder='e.g. "Plan leader does not want anyone to refer to this as an MCO. Use ‘integrated care organization’ instead."'
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">{form.note.length}/4000</div>
          </div>
        </div>

        <footer className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-hover">Cancel</button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-[#C49A22] px-4 py-2 text-sm font-semibold text-black hover:bg-[#D4AA32] disabled:opacity-50"
          >
            {busy ? "Saving…" : isNew ? "Add Sensitivity" : "Save Changes"}
          </button>
        </footer>
      </form>
    </div>
  );
}
