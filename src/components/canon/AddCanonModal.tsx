import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { createCanonEntry } from "@/lib/canon.functions";

const CATEGORIES = [
  "Federal Statutes",
  "Federal Regulations",
  "CMS Guidance",
  "Medicaid Authorities",
  "Medicare Authorities",
  "MACPAC / MedPAC",
  "KFF Reference",
  "Athena Playbooks",
  "Athena Methodologies",
  "Writing Standards",
];

export function AddCanonModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createCanonEntry);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    topic: "",
    category: "CMS Guidance",
    citation: "",
    content: "",
    source_url: "",
    tags: "",
    priority: 3,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await create({
        data: {
          topic: form.topic.trim(),
          category: form.category as any,
          citation: form.citation.trim() || undefined,
          content: form.content.trim(),
          source_url: form.source_url.trim() || undefined,
          tags: form.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          priority: Number(form.priority),
        },
      });
      toast.success("Canon entry saved.");
      qc.invalidateQueries({ queryKey: ["canon-lib"] });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-2xl space-y-3 rounded-lg border border-border bg-background p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-light">Add Canon Entry</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <Field label="Topic *">
          <input
            required
            maxLength={200}
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
            className="input"
            placeholder="e.g. Person-First Language"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category *">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="input"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority (1=highest)">
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
              className="input"
            >
              {[1, 2, 3, 4, 5].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Citation (optional)">
          <input
            maxLength={200}
            value={form.citation}
            onChange={(e) => setForm({ ...form, citation: e.target.value })}
            className="input"
            placeholder="e.g. 42 CFR §438.68"
          />
        </Field>

        <Field label="Content *">
          <textarea
            required
            maxLength={4000}
            rows={6}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            className="input font-mono text-[12px]"
            placeholder="The rule IRIS will read. 1–4 dense, operational sentences."
          />
          <div className="text-[10px] text-muted-foreground">{form.content.length}/4000</div>
        </Field>

        <Field label="Source URL (optional)">
          <input
            type="url"
            maxLength={500}
            value={form.source_url}
            onChange={(e) => setForm({ ...form, source_url: e.target.value })}
            className="input"
            placeholder="https://…"
          />
        </Field>

        <Field label="Tags (comma-separated)">
          <input
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            className="input"
            placeholder="managed-care, compliance"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
            style={{ background: "#C49A22", color: "#0b0b0b" }}
          >
            {saving ? "Saving…" : "Save Entry"}
          </button>
        </div>
      </form>

      <style>{`
        .input { width: 100%; border-radius: 6px; border: 1px solid hsl(var(--border)); background: hsl(var(--surface) / 0.5); padding: 8px 10px; font-size: 13px; color: hsl(var(--foreground)); }
        .input:focus { outline: none; border-color: #C49A22; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
